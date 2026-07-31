import Foundation
import Security

func fail(_ message: String, status: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data("FAIL \(message)\n".utf8))
    Foundation.exit(status)
}

guard CommandLine.arguments.count == 4 else {
    fail("Usage: retained-qa-keychain.swift read|write SERVICE ACCOUNT")
}

let operation = CommandLine.arguments[1]
let service = CommandLine.arguments[2]
let account = CommandLine.arguments[3]

let query: [CFString: Any] = [
    kSecClass: kSecClassGenericPassword,
    kSecAttrService: service,
    kSecAttrAccount: account,
]

switch operation {
case "read":
    var readQuery = query
    readQuery[kSecReturnData] = true
    readQuery[kSecMatchLimit] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(readQuery as CFDictionary, &result)
    if status == errSecItemNotFound {
        Foundation.exit(44)
    }
    guard status == errSecSuccess, let data = result as? Data else {
        fail("Could not read the exact Keychain item (OSStatus \(status)).")
    }
    FileHandle.standardOutput.write(data)

case "write":
    let password = FileHandle.standardInput.readDataToEndOfFile()
    guard password.count >= 16 && password.count <= 4096 else {
        fail("Password input must contain between 16 and 4096 bytes.")
    }
    guard !password.contains(0x00) && !password.contains(0x0A) && !password.contains(0x0D) else {
        fail("Password input contains a forbidden byte.")
    }

    let attributes: [CFString: Any] = [
        kSecValueData: password,
        kSecAttrLabel: "Quipsly retained QA password",
        kSecAttrDescription: "Generated for longitudinal Quipsly testing",
    ]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess {
        break
    }
    guard updateStatus == errSecItemNotFound else {
        fail("Could not update the exact Keychain item (OSStatus \(updateStatus)).")
    }

    var addQuery = query
    for (key, value) in attributes {
        addQuery[key] = value
    }
    addQuery[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
        fail("Could not create the exact Keychain item (OSStatus \(addStatus)).")
    }

default:
    fail("Operation must be read or write.")
}
