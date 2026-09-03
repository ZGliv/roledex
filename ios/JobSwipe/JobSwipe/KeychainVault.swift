import Foundation
import Security

protocol CredentialVault: Sendable {
    func readCredential() throws -> String?
    func saveCredential(_ credential: String) throws
    func deleteCredential() throws
}

struct KeychainVault: CredentialVault {
    private let account = "native-installation"
    private let service = "app.jobswipe.session"

    func readCredential() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = item as? Data,
              let credential = String(data: data, encoding: .utf8)
        else { throw VaultError(status: status) }
        return credential
    }

    func saveCredential(_ credential: String) throws {
        try deleteCredential()
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: Data(credential.utf8),
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw VaultError(status: status) }
    }

    func deleteCredential() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw VaultError(status: status)
        }
    }
}

private struct VaultError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? { "Secure session storage failed (\(status))." }
}
