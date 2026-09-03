import Foundation
import UIKit

actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let vault: any CredentialVault
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var accessToken: String?
    private var accessTokenExpiry: Date?

    init(
        baseURL: URL,
        session: URLSession = .shared,
        vault: any CredentialVault = KeychainVault()
    ) {
        self.baseURL = baseURL
        self.session = session
        self.vault = vault
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) { return date }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected an ISO-8601 date."
            )
        }
        self.decoder = decoder
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder
    }

    func bootstrap() async throws {
        if let credential = try vault.readCredential() {
            do {
                try await refresh(using: credential)
                return
            } catch let error as APIError where error.status == 401 {
                try vault.deleteCredential()
            }
        }
        try await createInstallation()
    }

    func loadFeed(lane: String, cursor: String? = nil, limit: Int = 25) async throws -> FeedEnvelope {
        var components = URLComponents()
        components.path = "/api/v1/feed"
        components.queryItems = [
            URLQueryItem(name: "lane", value: lane),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        if let cursor { components.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
        guard let path = components.string else {
            throw APIError(status: 0, code: "invalid_url", message: "The feed address is invalid.")
        }
        return try await authorizedRequest(
            path: path,
            method: "GET",
            response: FeedEnvelope.self
        )
    }

    func loadSaved() async throws -> [NativeJob] {
        let envelope: APIEnvelope<[NativeJob]> = try await authorizedRequest(
            path: "/api/v1/saved",
            method: "GET",
            response: APIEnvelope<[NativeJob]>.self
        )
        return envelope.data
    }

    func loadProfile() async throws -> ProfileSummary {
        let envelope: APIEnvelope<ProfileSummary> = try await authorizedRequest(
            path: "/api/v1/profile",
            method: "GET",
            response: APIEnvelope<ProfileSummary>.self
        )
        return envelope.data
    }

    func loadJob(id: UUID) async throws -> NativeJob {
        let envelope: APIEnvelope<NativeJob> = try await authorizedRequest(
            path: "/api/v1/jobs/\(id.uuidString)",
            method: "GET",
            response: APIEnvelope<NativeJob>.self
        )
        return envelope.data
    }

    func pair(code: String) async throws {
        struct Body: Encodable { let code: String }
        let envelope: APIEnvelope<SessionPayload> = try await authorizedRequest(
            path: "/api/v1/native/pair",
            method: "POST",
            body: Body(code: code),
            response: APIEnvelope<SessionPayload>.self
        )
        try store(session: envelope.data)
    }

    func exportWorkspace() async throws -> Data {
        let token = try await validAccessToken()
        guard let url = URL(string: "/api/v1/export", relativeTo: baseURL) else {
            throw APIError(status: 0, code: "invalid_url", message: "The server address is invalid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, rawResponse) = try await session.data(for: request)
        try validate(rawResponse, data: data)
        return data
    }

    func deleteWorkspace() async throws {
        struct Result: Decodable {
            let deleted: Bool
            let profilesDeleted: Int
        }
        let _: APIEnvelope<Result> = try await authorizedRequest(
            path: "/api/v1/workspace",
            method: "DELETE",
            response: APIEnvelope<Result>.self
        )
        try vault.deleteCredential()
        accessToken = nil
        accessTokenExpiry = nil
    }

    func finishOnboarding(_ draft: OnboardingDraft, profile: ProfileSummary) async throws {
        struct RevisionResult: Decodable { let revision: Int }
        struct CoreBody: Encodable {
            struct Values: Encodable {
                let expectedRevision: Int
                let currentRole: String
                let currentSalaryCents: Int
                let preferredSalaryMinimumCents: Int
                let preferredSalaryTargetCents: Int
                let preferredWorkArrangements: [String]
                let preferredIndustries: [String]
                let targetRoleFamilies: [String]
                let strengths: [String]
                let weaknesses: [String]
                let interests: [String]
                let skills: [String]
                let yearsExperience: Int
                let location: String
                let relocationPreference: String
                let careerGoals: [String]
                let interviewConcerns: [String]
                let dealBreakers: [String]
            }
            let section = "core"
            let values: Values
        }
        struct SearchBody: Encodable {
            struct Values: Encodable {
                let expectedRevision: Int
                let desiredSeniorityLevels: [String]
                let excludedTitles: [String]
                let excludedCompanies: [String]
                let excludedIndustries: [String]
                let acceptedEmploymentTypes: [String]
                let preferredWorkModes: [String]
                let strictWorkModes: Bool
                let commuteRadiusMiles: Int?
                let maxOfficeDaysPerWeek: Int?
                let relocationDestinations: [String]
                let maxTravelPercent: Int?
                let workAuthorization: String
                let requiresSponsorship: Bool?
                let missingSalaryPolicy: String
            }
            let section = "search"
            let values: Values
        }

        let core: APIEnvelope<RevisionResult> = try await authorizedRequest(
            path: "/api/v1/profile",
            method: "PATCH",
            body: CoreBody(values: .init(
                expectedRevision: profile.revision,
                currentRole: draft.currentRole,
                currentSalaryCents: profile.currentSalaryCents,
                preferredSalaryMinimumCents: draft.minimumSalary * 100,
                preferredSalaryTargetCents: draft.targetSalary * 100,
                preferredWorkArrangements: draft.workModes.sorted(),
                preferredIndustries: profile.preferredIndustries,
                targetRoleFamilies: draft.targetRoles.sorted(),
                strengths: profile.strengths,
                weaknesses: profile.weaknesses,
                interests: profile.interests,
                skills: profile.skills,
                yearsExperience: draft.yearsExperience,
                location: draft.location,
                relocationPreference: profile.relocationPreference ?? "",
                careerGoals: profile.careerGoals,
                interviewConcerns: profile.interviewConcerns,
                dealBreakers: profile.dealBreakers
            )),
            response: APIEnvelope<RevisionResult>.self
        )
        let _: APIEnvelope<RevisionResult> = try await authorizedRequest(
            path: "/api/v1/profile",
            method: "PATCH",
            body: SearchBody(values: .init(
                expectedRevision: core.data.revision,
                desiredSeniorityLevels: draft.seniorities.sorted(),
                excludedTitles: profile.excludedTitles,
                excludedCompanies: profile.excludedCompanies,
                excludedIndustries: profile.excludedIndustries,
                acceptedEmploymentTypes: profile.acceptedEmploymentTypes,
                preferredWorkModes: draft.workModes.sorted(),
                strictWorkModes: profile.strictWorkModes,
                commuteRadiusMiles: profile.commuteRadiusMiles,
                maxOfficeDaysPerWeek: profile.maxOfficeDaysPerWeek,
                relocationDestinations: profile.relocationDestinations,
                maxTravelPercent: profile.maxTravelPercent,
                workAuthorization: profile.workAuthorization,
                requiresSponsorship: profile.requiresSponsorship,
                missingSalaryPolicy: profile.missingSalaryPolicy
            )),
            response: APIEnvelope<RevisionResult>.self
        )
        struct Completion: Decodable { let completed: Bool }
        let _: APIEnvelope<Completion> = try await authorizedRequest(
            path: "/api/v1/onboarding/complete",
            method: "POST",
            response: APIEnvelope<Completion>.self
        )
    }

    func decide(job: NativeJob, decision: String) async throws {
        struct DecisionBody: Encodable {
            let decision: String
            let expectedDecision: String
            let expectedDecisionEventId: UUID?
            let reasonCodes: [String]
        }
        let _: APIEnvelope<DecisionResult> = try await authorizedRequest(
            path: "/api/v1/jobs/\(job.id)/decisions",
            method: "POST",
            body: DecisionBody(
                decision: decision,
                expectedDecision: job.currentDecision,
                expectedDecisionEventId: job.currentDecisionEventId,
                reasonCodes: []
            ),
            response: APIEnvelope<DecisionResult>.self
        )
    }

    private struct DecisionResult: Decodable {
        let changed: Bool
        let decision: String
        let decisionEventId: UUID?
    }

    private func createInstallation() async throws {
        struct Body: Encodable {
            let platform = "ios"
            let appVersion: String
            let buildNumber: String
            let deviceName: String?
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let body = Body(
            appVersion: info["CFBundleShortVersionString"] as? String ?? "0",
            buildNumber: info["CFBundleVersion"] as? String ?? "0",
            deviceName: await UIDevice.current.name
        )
        let envelope: APIEnvelope<SessionPayload> = try await request(
            path: "/api/v1/native/installations",
            method: "POST",
            body: body,
            response: APIEnvelope<SessionPayload>.self
        )
        try store(session: envelope.data)
    }

    private func refresh(using credential: String) async throws {
        let envelope: APIEnvelope<SessionPayload> = try await request(
            path: "/api/v1/native/sessions/refresh",
            method: "POST",
            bearer: credential,
            response: APIEnvelope<SessionPayload>.self
        )
        try store(session: envelope.data)
    }

    private func store(session payload: SessionPayload) throws {
        try vault.saveCredential(payload.installationCredential)
        accessToken = payload.accessToken
        accessTokenExpiry = payload.accessTokenExpiresAt
    }

    private func validAccessToken() async throws -> String {
        if let accessToken,
           let accessTokenExpiry,
           accessTokenExpiry.timeIntervalSinceNow > 30 {
            return accessToken
        }
        guard let credential = try vault.readCredential() else {
            try await createInstallation()
            guard let accessToken else { throw APIError(status: 401, code: "missing_session", message: "A session could not be created.") }
            return accessToken
        }
        try await refresh(using: credential)
        guard let accessToken else { throw APIError(status: 401, code: "missing_session", message: "A session could not be refreshed.") }
        return accessToken
    }

    private func authorizedRequest<Response: Decodable>(
        path: String,
        method: String,
        response: Response.Type
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            bearer: validAccessToken(),
            response: response
        )
    }

    private func authorizedRequest<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body,
        response: Response.Type
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            body: body,
            bearer: validAccessToken(),
            response: response
        )
    }

    private func request<Response: Decodable>(
        path: String,
        method: String,
        bearer: String? = nil,
        response: Response.Type
    ) async throws -> Response {
        try await request(
            path: path,
            method: method,
            body: Optional<String>.none,
            bearer: bearer,
            response: response
        )
    }

    private func request<Body: Encodable, Response: Decodable>(
        path: String,
        method: String,
        body: Body?,
        bearer: String? = nil,
        response: Response.Type
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError(status: 0, code: "invalid_url", message: "The server address is invalid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 25
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, rawResponse) = try await session.data(for: request)
        try validate(rawResponse, data: data)
        return try decoder.decode(response, from: data)
    }

    private func validate(_ rawResponse: URLResponse, data: Data) throws {
        guard let http = rawResponse as? HTTPURLResponse else {
            throw APIError(status: 0, code: "invalid_response", message: "The server response was invalid.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? decoder.decode(APIErrorEnvelope.self, from: data)
            throw APIError(
                status: http.statusCode,
                code: payload?.error.code ?? "request_failed",
                message: payload?.error.message ?? "The request failed."
            )
        }
    }
}
