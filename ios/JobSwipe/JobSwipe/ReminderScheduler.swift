import Foundation
import UserNotifications

actor ReminderScheduler {
    static let shared = ReminderScheduler()

    func scheduleTomorrow(for job: NativeJob) async throws {
        let center = UNUserNotificationCenter.current()
        let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
        guard granted else {
            throw ReminderError.permissionDenied
        }

        let content = UNMutableNotificationContent()
        content.title = "Follow up on \(job.company)"
        content.body = "Take another look at \(job.title) and decide your next step."
        content.sound = .default
        content.userInfo = ["jobId": job.id.uuidString]

        let request = UNNotificationRequest(
            identifier: "job-follow-up-\(job.id.uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 24 * 60 * 60, repeats: false)
        )
        try await center.add(request)
    }
}

private enum ReminderError: LocalizedError {
    case permissionDenied

    var errorDescription: String? {
        "Enable notifications in Settings to create follow-up reminders."
    }
}
