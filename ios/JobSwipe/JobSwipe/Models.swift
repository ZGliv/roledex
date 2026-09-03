import Foundation

struct APIEnvelope<Value: Decodable>: Decodable {
    let data: Value
}

struct SessionPayload: Codable, Equatable {
    let accessToken: String
    let accessTokenExpiresAt: Date
    let installationCredential: String
    let installationCredentialExpiresAt: Date
    let installationId: UUID
    let workspaceId: UUID
}

struct NativeJob: Codable, Identifiable, Equatable {
    struct Salary: Codable, Equatable {
        let display: String
        let source: String
        let confidence: String
        let annualMinimumCents: Int
        let annualMaximumCents: Int
    }

    struct Fit: Codable, Equatable {
        let score: Double
        let coverage: Double
        let verdict: String
        let readiness: String
        let explanation: String
        let strongestMatches: [String]
        let biggestGaps: [String]
        let personalizedReasons: [String]
    }

    struct Source: Codable, Equatable {
        let name: String
        let url: URL?
        let postedAt: String?
    }

    let id: UUID
    let title: String
    let company: String
    let location: String
    let workArrangement: String
    let employmentType: String
    let salary: Salary
    let fit: Fit
    let currentDecision: String
    let currentDecisionEventId: UUID?
    let source: Source
}

struct FeedEnvelope: Decodable {
    struct Meta: Decodable {
        struct Counts: Decodable {
            let matches: Int
            let stretch: Int
            let filtered: Int
        }

        let lane: String
        let mode: String
        let counts: Counts
        let hasMore: Bool
        let nextCursor: String?
    }

    let data: [NativeJob]
    let meta: Meta
}

struct ProfileSummary: Decodable, Equatable {
    struct Evidence: Decodable, Equatable {
        let workHistoryCount: Int
        let educationCount: Int
        let skillEvidenceCount: Int
        let projectCount: Int
    }

    let revision: Int
    let onboardingCompleted: Bool
    let currentRole: String
    let currentSalaryCents: Int
    let yearsExperience: Int
    let location: String?
    let relocationPreference: String?
    let targetRoleFamilies: [String]
    let desiredSeniorityLevels: [String]
    let preferredSalaryMinimumCents: Int
    let preferredSalaryTargetCents: Int
    let preferredWorkModes: [String]
    let strictWorkModes: Bool
    let acceptedEmploymentTypes: [String]
    let preferredIndustries: [String]
    let strengths: [String]
    let weaknesses: [String]
    let interests: [String]
    let careerGoals: [String]
    let dealBreakers: [String]
    let interviewConcerns: [String]
    let excludedTitles: [String]
    let excludedCompanies: [String]
    let excludedIndustries: [String]
    let commuteRadiusMiles: Int?
    let maxOfficeDaysPerWeek: Int?
    let relocationDestinations: [String]
    let maxTravelPercent: Int?
    let workAuthorization: String
    let requiresSponsorship: Bool?
    let missingSalaryPolicy: String
    let skills: [String]
    let evidence: Evidence
    let updatedAt: Date
}

struct OnboardingDraft {
    var currentRole = ""
    var targetRoles: Set<String> = []
    var yearsExperience = 0
    var location = ""
    var workModes: Set<String> = ["remote", "hybrid"]
    var minimumSalary = 60_000
    var targetSalary = 80_000
    var seniorities: Set<String> = ["entry", "mid"]
}

struct APIErrorEnvelope: Decodable {
    struct Payload: Decodable {
        let code: String
        let message: String
    }

    let error: Payload
}

struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }
}
