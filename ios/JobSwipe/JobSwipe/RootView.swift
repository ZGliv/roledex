import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.015, green: 0.025, blue: 0.06), Color(red: 0.05, green: 0.035, blue: 0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            switch model.phase {
            case .starting:
                ProgressView()
                    .controlSize(.large)
                    .tint(.white)
                    .accessibilityLabel("Loading JobSwipe")
            case .failed(let message):
                ContentUnavailableView {
                    Label("JobSwipe is offline", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.start() } }
                        .buttonStyle(.borderedProminent)
                }
                .foregroundStyle(.white)
            case .ready:
                if model.profile?.onboardingCompleted == true {
                    TabView(selection: $model.selectedTab) {
                        DiscoverView()
                            .tabItem { Label("Discover", systemImage: "safari") }
                            .tag("discover")
                        SavedView()
                            .tabItem { Label("Saved", systemImage: "heart") }
                            .tag("saved")
                        ProfileView()
                            .tabItem { Label("You", systemImage: "person") }
                            .tag("profile")
                    }
                    .tint(Color(red: 0.62, green: 0.52, blue: 1))
                } else {
                    NativeOnboardingView()
                }
            }
        }
        .preferredColorScheme(.dark)
        .onOpenURL { url in
            Task { await model.openDeepLink(url) }
        }
        .sheet(item: $model.presentedJob) { job in
            NavigationStack { NativeJobDetailView(job: job) }
        }
        .alert(
            "JobSwipe",
            isPresented: Binding(
                get: { model.notice != nil },
                set: { if !$0 { model.notice = nil } }
            ),
            actions: { Button("OK", role: .cancel) { model.notice = nil } },
            message: { Text(model.notice ?? "") }
        )
    }
}

private struct NativeOnboardingView: View {
    @EnvironmentObject private var model: AppModel
    let isEditing: Bool
    @State private var draft = OnboardingDraft()
    @State private var step = 0
    @State private var customRole = ""

    private let roleOptions = [
        "Customer Success", "Implementation", "IT Support", "Solutions Engineer",
        "Product Operations", "Technical Support", "Business Operations", "Product Marketing",
    ]
    private let seniorityOptions = [
        ("entry", "Entry"), ("mid", "Mid-level"), ("senior", "Senior"), ("manager", "Manager"),
    ]
    private let modeOptions = [
        ("remote", "Remote", "house.laptop"),
        ("hybrid", "Hybrid", "building.2"),
        ("on_site", "On-site", "building"),
    ]

    init(isEditing: Bool = false) {
        self.isEditing = isEditing
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(isEditing ? "Tune your search" : "Set up your search")
                        .font(.title2.weight(.semibold))
                    Text("Step \(step + 1) of 4")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(Int(Double(step + 1) / 4 * 100))%")
                    .font(.subheadline.monospacedDigit().weight(.semibold))
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)

            ProgressView(value: Double(step + 1), total: 4)
                .tint(Color(red: 0.62, green: 0.52, blue: 1))
                .padding(.horizontal, 22)
                .padding(.vertical, 14)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch step {
                    case 0: roleStep
                    case 1: experienceStep
                    case 2: workStyleStep
                    default: payStep
                    }
                }
                .frame(maxWidth: 620, alignment: .leading)
                .padding(.horizontal, 22)
                .padding(.bottom, 30)
            }
            .scrollDismissesKeyboard(.interactively)

            HStack(spacing: 12) {
                if step > 0 {
                    Button("Back") { withAnimation { step -= 1 } }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                }
                Button(step == 3 ? (isEditing ? "Save changes" : "Build my feed") : "Continue") {
                    if step == 3 {
                        Task { await model.finishOnboarding(draft) }
                    } else {
                        withAnimation { step += 1 }
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
                .disabled(!canContinue)
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(.ultraThinMaterial)
        }
        .onAppear { seedFromProfile() }
    }

    private var roleStep: some View {
        onboardingPanel(
            title: "What kind of work do you want?",
            detail: "Choose a few directions. You can make these stricter later."
        ) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 142), spacing: 10)], spacing: 10) {
                ForEach(roleOptions, id: \.self) { role in
                    choiceButton(role, selected: draft.targetRoles.contains(role)) {
                        toggle(role, in: &draft.targetRoles)
                    }
                }
            }
            HStack(spacing: 10) {
                TextField("Add another role", text: $customRole)
                    .textInputAutocapitalization(.words)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                Button("Add") {
                    let value = customRole.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !value.isEmpty { draft.targetRoles.insert(value); customRole = "" }
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(customRole.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private var experienceStep: some View {
        onboardingPanel(
            title: "Where are you starting from?",
            detail: "This keeps senior roles and unrealistic requirements out of your main feed."
        ) {
            TextField("Current or most recent role", text: $draft.currentRole)
                .textInputAutocapitalization(.words)
                .onboardingField()

            Stepper(value: $draft.yearsExperience, in: 0...30) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Relevant experience").font(.subheadline).foregroundStyle(.secondary)
                    Text(draft.yearsExperience == 1 ? "1 year" : "\(draft.yearsExperience) years")
                        .font(.title3.weight(.semibold))
                }
            }
            .padding(14)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))

            Text("Levels you would consider")
                .font(.subheadline.weight(.medium))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
                ForEach(seniorityOptions, id: \.0) { value, label in
                    choiceButton(label, selected: draft.seniorities.contains(value)) {
                        toggle(value, in: &draft.seniorities)
                    }
                }
            }
        }
    }

    private var workStyleStep: some View {
        onboardingPanel(
            title: "Where can the job be?",
            detail: "Your location and acceptable work styles are used as real filters."
        ) {
            TextField("City, state, or region", text: $draft.location)
                .textInputAutocapitalization(.words)
                .onboardingField()
            ForEach(modeOptions, id: \.0) { value, label, icon in
                Button {
                    toggle(value, in: &draft.workModes)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: icon).frame(width: 24)
                        Text(label).font(.body.weight(.medium))
                        Spacer()
                        Image(systemName: draft.workModes.contains(value) ? "checkmark.circle.fill" : "circle")
                    }
                    .frame(minHeight: 50)
                    .padding(.horizontal, 14)
                }
                .buttonStyle(.plain)
                .background(
                    draft.workModes.contains(value) ? Color.purple.opacity(0.2) : Color.white.opacity(0.06),
                    in: RoundedRectangle(cornerRadius: 16)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(draft.workModes.contains(value) ? Color.purple.opacity(0.8) : Color.white.opacity(0.1))
                }
            }
        }
    }

    private var payStep: some View {
        onboardingPanel(
            title: "What pay is worth considering?",
            detail: "Jobs entirely below your minimum stay out. Your target helps rank the rest."
        ) {
            salaryControl("Minimum salary", value: $draft.minimumSalary, range: 30_000...200_000)
            salaryControl("Target salary", value: $draft.targetSalary, range: 40_000...250_000)
            Text("You can change every setting later from You. Salary is kept private.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var canContinue: Bool {
        switch step {
        case 0: !draft.targetRoles.isEmpty
        case 1: !draft.currentRole.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !draft.seniorities.isEmpty
        case 2: !draft.location.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !draft.workModes.isEmpty
        default: draft.minimumSalary <= draft.targetSalary
        }
    }

    private func onboardingPanel<Content: View>(
        title: String,
        detail: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.system(size: 30, weight: .semibold, design: .rounded))
            Text(detail).font(.body).foregroundStyle(.secondary)
            content()
        }
        .padding(20)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(.white.opacity(0.12), lineWidth: 1)
        }
    }

    private func choiceButton(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 2)
                if selected { Image(systemName: "checkmark") }
            }
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, 12)
        }
        .buttonStyle(.plain)
        .background(selected ? Color.purple.opacity(0.22) : Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(selected ? Color.purple.opacity(0.8) : Color.white.opacity(0.1))
        }
    }

    private func salaryControl(_ label: String, value: Binding<Int>, range: ClosedRange<Int>) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(label).foregroundStyle(.secondary)
                Spacer()
                Text(value.wrappedValue, format: .currency(code: "USD").precision(.fractionLength(0)))
                    .font(.headline.monospacedDigit())
            }
            Slider(
                value: Binding(
                    get: { Double(value.wrappedValue) },
                    set: { value.wrappedValue = Int($0 / 5_000) * 5_000 }
                ),
                in: Double(range.lowerBound)...Double(range.upperBound),
                step: 5_000
            )
            .tint(Color(red: 0.62, green: 0.52, blue: 1))
        }
        .padding(14)
        .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
    }

    private func toggle(_ value: String, in values: inout Set<String>) {
        if values.contains(value) { values.remove(value) } else { values.insert(value) }
    }

    private func seedFromProfile() {
        guard let profile = model.profile else { return }
        draft.currentRole = profile.currentRole == "Add your current role" ? "" : profile.currentRole
        draft.targetRoles = Set(profile.targetRoleFamilies)
        draft.yearsExperience = profile.yearsExperience
        draft.location = profile.location ?? ""
        draft.workModes = Set(profile.preferredWorkModes)
        draft.minimumSalary = max(30_000, profile.preferredSalaryMinimumCents / 100)
        draft.targetSalary = max(draft.minimumSalary, profile.preferredSalaryTargetCents / 100)
        draft.seniorities = Set(profile.desiredSeniorityLevels.isEmpty ? ["entry", "mid"] : profile.desiredSeniorityLevels)
    }
}

private struct DiscoverView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selectedJob: NativeJob?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Picker("Feed", selection: $model.selectedLane) {
                    Text("Matches").tag("matches")
                    Text("Stretch").tag("stretch")
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .onChange(of: model.selectedLane) { _, lane in
                    Task { await model.switchLane(to: lane) }
                }

                Text(
                    model.selectedLane == "matches"
                        ? "Direct roles that pass every hard filter"
                        : "Plausible adjacent roles with no hard conflicts"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .contentTransition(.opacity)

                if let job = model.feed.first {
                    NativeJobCard(job: job) { decision in
                        Task { await model.decide(job, as: decision) }
                    } open: {
                        selectedJob = job
                    }
                    .padding(.horizontal, 18)
                } else if model.isLoadingFeed {
                    ProgressView("Finding qualified roles…")
                        .controlSize(.large)
                } else {
                    ContentUnavailableView(
                        "You’re caught up",
                        systemImage: "checkmark.circle",
                        description: Text("New qualified roles will appear here.")
                    )
                }
            }
            .navigationTitle("Discover")
            .navigationBarTitleDisplayMode(.inline)
            .refreshable { await model.refreshCurrentLane() }
        }
        .sheet(item: $selectedJob) { job in
            NavigationStack { NativeJobDetailView(job: job) }
        }
    }
}

private struct NativeJobCard: View {
    let job: NativeJob
    let decide: (String) -> Void
    let open: () -> Void
    @State private var drag = CGSize.zero

    private var swipeOffset: CGSize {
        let threshold: CGFloat = 28
        guard abs(drag.width) > threshold else { return .zero }
        let translated = drag.width - (drag.width > 0 ? threshold : -threshold)
        return CGSize(width: translated, height: drag.height * 0.12)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer(minLength: 24)
            Text(job.company.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(1.5)
                .foregroundStyle(.secondary)
            Text(job.title)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .lineLimit(3)
                .minimumScaleFactor(0.72)
            Text(job.salary.display)
                .font(.title2.weight(.semibold))
            HStack {
                Label(job.location, systemImage: "location")
                Spacer()
                Text(job.workArrangement)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            Divider()
            Text(job.fit.explanation)
                .font(.body)
                .foregroundStyle(.secondary)
                .lineLimit(3)
            Spacer()
            HStack(spacing: 12) {
                Button { commit("skipped") } label: {
                    Image(systemName: "xmark")
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Pass")
                Button { commit("saved") } label: {
                    Image(systemName: "heart.fill")
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("Save")
                Button(action: open) {
                    Image(systemName: "arrow.up.right")
                        .frame(width: 28, height: 52)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("View job details")
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: 620)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .stroke(.white.opacity(0.22), lineWidth: 1)
        }
        .shadow(color: .purple.opacity(0.2), radius: 28, y: 18)
        .rotation3DEffect(
            .degrees(Double(max(-12, min(12, drag.width / 14)))),
            axis: (x: 0, y: 1, z: 0),
            perspective: 0.55
        )
        .rotation3DEffect(
            .degrees(Double(max(-8, min(8, -drag.height / 22)))),
            axis: (x: 1, y: 0, z: 0),
            perspective: 0.55
        )
        .offset(swipeOffset)
        .gesture(
            DragGesture(minimumDistance: 2)
                .onChanged { drag = $0.translation }
                .onEnded { value in
                    if value.predictedEndTranslation.width > 140 { commit("saved") }
                    else if value.predictedEndTranslation.width < -140 { commit("skipped") }
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) { drag = .zero }
                }
        )
        .accessibilityElement(children: .contain)
    }

    private func commit(_ decision: String) {
        let feedback = UINotificationFeedbackGenerator()
        feedback.notificationOccurred(decision == "saved" ? .success : .warning)
        decide(decision)
    }
}

private struct SavedView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""

    private var filteredJobs: [NativeJob] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return model.saved }
        return model.saved.filter {
            $0.title.localizedCaseInsensitiveContains(needle) ||
                $0.company.localizedCaseInsensitiveContains(needle) ||
                $0.location.localizedCaseInsensitiveContains(needle)
        }
    }

    var body: some View {
        NavigationStack {
            List(filteredJobs) { job in
                NavigationLink {
                    NativeJobDetailView(job: job)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(job.title).font(.headline)
                        Text("\(job.company) · \(job.salary.display)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("Saved")
            .searchable(text: $query, prompt: "Role, company, or location")
            .refreshable { await model.refreshSaved() }
            .overlay {
                if filteredJobs.isEmpty {
                    if model.saved.isEmpty && query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        ContentUnavailableView(
                            "Nothing saved yet",
                            systemImage: "heart",
                            description: Text("Save a role from Discover and it will stay organized here.")
                        )
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
        }
    }
}

private struct NativeJobDetailView: View {
    let job: NativeJob
    @Environment(\.dismiss) private var dismiss
    @State private var reminderStatus: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(job.company.uppercased())
                        .font(.caption.weight(.semibold))
                        .tracking(1.3)
                        .foregroundStyle(.secondary)
                    Text(job.title)
                        .font(.system(size: 34, weight: .semibold, design: .rounded))
                    Text(job.salary.display)
                        .font(.title2.weight(.semibold))
                    Text("\(job.location) · \(job.workArrangement)")
                        .foregroundStyle(.secondary)
                }

                detailSection("Why it fits") {
                    Text(job.fit.explanation)
                    if !job.fit.personalizedReasons.isEmpty {
                        ForEach(job.fit.personalizedReasons, id: \.self) { reason in
                            Label(reason, systemImage: "checkmark.circle")
                        }
                    }
                }

                if !job.fit.strongestMatches.isEmpty {
                    detailSection("Your strongest evidence") {
                        ForEach(job.fit.strongestMatches, id: \.self) { match in
                            Label(match, systemImage: "sparkles")
                        }
                    }
                }

                if !job.fit.biggestGaps.isEmpty {
                    detailSection("Worth checking") {
                        ForEach(job.fit.biggestGaps, id: \.self) { gap in
                            Label(gap, systemImage: "exclamationmark.circle")
                        }
                    }
                }

                if let sourceURL = job.source.url {
                    Link(destination: sourceURL) {
                        Label("Open original listing", systemImage: "safari")
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)

                    ShareLink(item: sourceURL, subject: Text(job.title)) {
                        Label("Share job", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.bordered)
                }

                Button {
                    Task {
                        do {
                            try await ReminderScheduler.shared.scheduleTomorrow(for: job)
                            reminderStatus = "Reminder set for tomorrow."
                        } catch {
                            reminderStatus = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Remind me tomorrow", systemImage: "bell")
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.bordered)

                if let reminderStatus {
                    Text(reminderStatus)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .transition(.opacity)
                }
            }
            .padding(22)
        }
        .background(Color.black.opacity(0.2))
        .navigationTitle("Job details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }

    private func detailSection<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct ProfileView: View {
    @EnvironmentObject private var model: AppModel
    @State private var pairingCode = ""
    @State private var exportURL: URL?
    @State private var status: String?
    @State private var isWorking = false
    @State private var confirmsDeletion = false

    var body: some View {
        NavigationStack {
            List {
                if let profile = model.profile {
                    Section("Current search") {
                        LabeledContent("Role", value: profile.currentRole)
                        LabeledContent("Experience", value: "\(profile.yearsExperience) years")
                        LabeledContent("Location", value: profile.location ?? "Not set")
                        NavigationLink("Edit search and filters") {
                            NativeOnboardingView(isEditing: true)
                                .navigationBarBackButtonHidden(false)
                        }
                    }
                    Section("Targets") {
                        ForEach(profile.targetRoleFamilies, id: \.self) { Text($0) }
                    }
                    Section("Evidence") {
                        LabeledContent("Work history", value: "\(profile.evidence.workHistoryCount)")
                        LabeledContent("Skills", value: "\(profile.evidence.skillEvidenceCount)")
                        LabeledContent("Projects", value: "\(profile.evidence.projectCount)")
                    }

                    Section {
                        TextField("12-character code", text: $pairingCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                        Button("Pair this phone") {
                            Task { await pairWorkspace() }
                        }
                        .disabled(normalizedPairingCode.count != 12 || isWorking)
                    } header: {
                        Text("Use an existing workspace")
                    } footer: {
                        Text("Generate a one-time code from JobSwipe on your other device. Codes expire after 10 minutes.")
                    }

                    Section("Your data") {
                        Button {
                            Task { await prepareExport() }
                        } label: {
                            Label("Prepare data export", systemImage: "square.and.arrow.up")
                        }
                        .disabled(isWorking)

                        if let exportURL {
                            ShareLink(item: exportURL) {
                                Label("Share downloaded export", systemImage: "doc.badge.arrow.up")
                            }
                        }

                        Button(role: .destructive) {
                            confirmsDeletion = true
                        } label: {
                            Label("Delete this workspace", systemImage: "trash")
                        }
                        .disabled(isWorking)
                    }

                    Section("About") {
                        Link("Privacy policy", destination: model.publicBaseURL.appending(path: "privacy"))
                        Link("Terms of use", destination: model.publicBaseURL.appending(path: "terms"))
                        Link("Support", destination: model.publicBaseURL.appending(path: "support"))
                    }

                    if let status {
                        Section {
                            Text(status).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("You")
            .overlay {
                if isWorking {
                    ProgressView().controlSize(.large)
                }
            }
            .confirmationDialog(
                "Permanently delete this workspace?",
                isPresented: $confirmsDeletion,
                titleVisibility: .visible
            ) {
                Button("Delete workspace", role: .destructive) {
                    Task { await deleteWorkspace() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This removes your profile, saved jobs, decisions, and application data. It cannot be undone.")
            }
        }
    }

    private var normalizedPairingCode: String {
        pairingCode.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    @MainActor
    private func pairWorkspace() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await model.pairWorkspace(code: normalizedPairingCode)
            pairingCode = ""
            status = "Workspace paired."
        } catch {
            status = error.localizedDescription
        }
    }

    @MainActor
    private func prepareExport() async {
        isWorking = true
        defer { isWorking = false }
        do {
            exportURL = try await model.prepareExport()
            status = "Your private JSON export is ready to share or save."
        } catch {
            status = error.localizedDescription
        }
    }

    @MainActor
    private func deleteWorkspace() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await model.deleteWorkspace()
        } catch {
            status = error.localizedDescription
        }
    }
}

private extension View {
    func onboardingField() -> some View {
        self
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(.white.opacity(0.1), lineWidth: 1)
            }
    }
}
