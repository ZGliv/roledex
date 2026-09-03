import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    private struct LaneState {
        var jobs: [NativeJob] = []
        var nextCursor: String?
        var hasMore = true
        var loaded = false
    }

    enum Phase: Equatable {
        case starting
        case ready
        case failed(String)
    }

    @Published private(set) var phase: Phase = .starting
    @Published private(set) var feed: [NativeJob] = []
    @Published private(set) var saved: [NativeJob] = []
    @Published private(set) var profile: ProfileSummary?
    @Published private(set) var isLoadingFeed = false
    @Published var presentedJob: NativeJob?
    @Published var notice: String?
    @Published var selectedLane = "matches"
    @Published var selectedTab: String

    let publicBaseURL: URL

    private let client: APIClient
    private let publicHost: String?
    private var laneStates: [String: LaneState] = [
        "matches": LaneState(),
        "stretch": LaneState(),
    ]
    private var loadingLanes: Set<String> = []

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "JOBSWIPE_API_BASE_URL") as? String
        let url = URL(string: configured ?? "https://jobswipe-amber.vercel.app/")!
        publicBaseURL = url
        client = APIClient(baseURL: url)
        publicHost = url.host
#if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--jobswipe-tab"),
           arguments.indices.contains(index + 1),
           ["discover", "saved", "profile"].contains(arguments[index + 1]) {
            selectedTab = arguments[index + 1]
        } else {
            selectedTab = "discover"
        }
#else
        selectedTab = "discover"
#endif
    }

    func start() async {
        phase = .starting
        do {
            try await client.bootstrap()
            let profile = try await client.loadProfile()
            self.profile = profile
            resetFeedCache()
            guard profile.onboardingCompleted else {
                feed = []
                saved = []
                phase = .ready
                return
            }
            async let feed = client.loadFeed(lane: selectedLane)
            async let saved = client.loadSaved()
            let values = try await (feed, saved)
            store(values.0, requestedLane: selectedLane, replacing: true)
            self.saved = values.1
            phase = .ready
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func switchLane(to lane: String) async {
        selectedLane = lane
        if let state = laneStates[lane], state.loaded {
            feed = state.jobs
            updateLoadingIndicator()
            if state.jobs.count <= 7 && state.hasMore {
                await loadLane(lane, replacing: false)
            }
            return
        }
        feed = []
        await loadLane(lane, replacing: true)
    }

    func refreshCurrentLane() async {
        await loadLane(selectedLane, replacing: true)
    }

    func refreshSaved() async {
        do {
            saved = try await client.loadSaved()
        } catch {
            notice = error.localizedDescription
        }
    }

    func finishOnboarding(_ draft: OnboardingDraft) async {
        guard let profile else { return }
        phase = .starting
        do {
            try await client.finishOnboarding(draft, profile: profile)
            await start()
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func decide(_ job: NativeJob, as decision: String) async {
        guard feed.first?.id == job.id else { return }
        let originLane = selectedLane
        _ = withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            feed.removeFirst()
        }
        laneStates[originLane]?.jobs = feed
        do {
            try await client.decide(job: job, decision: decision)
            if decision == "saved", !saved.contains(where: { $0.id == job.id }) {
                saved.insert(job, at: 0)
            }
            if (laneStates[originLane]?.jobs.count ?? 0) <= 7 {
                await loadLane(originLane, replacing: false)
            }
        } catch {
            laneStates[originLane]?.jobs.insert(job, at: 0)
            if selectedLane == originLane { feed = laneStates[originLane]?.jobs ?? [job] }
            notice = error.localizedDescription
        }
    }

    func openDeepLink(_ url: URL) async {
        if url.scheme == "jobswipe", let destination = url.host,
           ["discover", "saved", "profile"].contains(destination) {
            selectedTab = destination
            return
        }
        let pathParts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "https", url.host == publicHost,
           pathParts.count == 1,
           ["discover", "saved", "profile"].contains(pathParts[0]) {
            selectedTab = pathParts[0]
            return
        }
        let candidate = url.scheme == "jobswipe"
            ? (url.host == "job" ? pathParts.first : pathParts.last)
            : (url.scheme == "https" && url.host == publicHost &&
               pathParts.count >= 2 && pathParts[pathParts.count - 2] == "jobs"
                ? pathParts.last
                : nil)
        guard let candidate, let id = UUID(uuidString: candidate) else { return }
        do {
            presentedJob = try await client.loadJob(id: id)
        } catch {
            notice = error.localizedDescription
        }
    }

    func pairWorkspace(code: String) async throws {
        let normalized = code.uppercased().filter { $0.isLetter || $0.isNumber }
        try await client.pair(code: normalized)
        notice = "This phone is now using the paired workspace."
        await start()
    }

    func prepareExport() async throws -> URL {
        let data = try await client.exportWorkspace()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("JobSwipe-export-\(formatter.string(from: Date())).json")
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }

    func deleteWorkspace() async throws {
        try await client.deleteWorkspace()
        notice = nil
        presentedJob = nil
        selectedLane = "matches"
        resetFeedCache()
        await start()
    }

    private func resetFeedCache() {
        laneStates = ["matches": LaneState(), "stretch": LaneState()]
        loadingLanes.removeAll()
        isLoadingFeed = false
    }

    private func loadLane(_ lane: String, replacing: Bool) async {
        guard !loadingLanes.contains(lane) else { return }
        let state = laneStates[lane] ?? LaneState()
        if !replacing && (!state.hasMore || !state.loaded) { return }

        loadingLanes.insert(lane)
        updateLoadingIndicator()
        defer {
            loadingLanes.remove(lane)
            updateLoadingIndicator()
        }

        do {
            let page = try await client.loadFeed(
                lane: lane,
                cursor: replacing ? nil : state.nextCursor
            )
            store(page, requestedLane: lane, replacing: replacing)
        } catch {
            notice = error.localizedDescription
        }
    }

    private func store(_ page: FeedEnvelope, requestedLane: String, replacing: Bool) {
        let actualLane = page.meta.lane
        if actualLane != requestedLane {
            laneStates[requestedLane] = LaneState(
                jobs: [],
                nextCursor: nil,
                hasMore: false,
                loaded: true
            )
            if selectedLane == requestedLane { selectedLane = actualLane }
        }

        var state = laneStates[actualLane] ?? LaneState()
        var jobs = replacing ? [] : state.jobs
        var known = Set(jobs.map(\.id))
        for job in page.data where known.insert(job.id).inserted {
            jobs.append(job)
        }
        state.jobs = jobs
        state.nextCursor = page.meta.nextCursor
        state.hasMore = page.meta.hasMore
        state.loaded = true
        laneStates[actualLane] = state
        if selectedLane == actualLane { feed = jobs }
    }

    private func updateLoadingIndicator() {
        isLoadingFeed = loadingLanes.contains(selectedLane)
    }
}
