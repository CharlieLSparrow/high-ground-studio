import Foundation

/// Converts remote authentication responses into stable, supportable errors.
///
/// Foundation's default `DecodingError.localizedDescription` says only that
/// data is not in the correct format. That is implementation detail, not a
/// recovery instruction. Keep the underlying decoder error for development
/// diagnostics while showing people the endpoint-specific fallback (or a
/// short server-provided error) instead.
enum AuthResponseDecoder {
    static func decode<T: Decodable>(
        _ type: T.Type,
        from data: Data,
        response: URLResponse,
        errorDomain: String,
        malformedResponseMessage: String
    ) throws -> (payload: T, response: HTTPURLResponse) {
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        do {
            return (
                try JSONDecoder().decode(type, from: data),
                http
            )
        } catch {
            let serverMessage = conciseServerMessage(from: data)
            let message = serverMessage
                ?? defaultMessage(
                    statusCode: http.statusCode,
                    malformedResponseMessage: malformedResponseMessage
                )
            throw NSError(
                domain: errorDomain,
                code: http.statusCode,
                userInfo: [
                    NSLocalizedDescriptionKey: message,
                    NSUnderlyingErrorKey: error,
                    "QuipslyResponseCategory": "invalid-json",
                    "QuipslyHTTPStatus": http.statusCode,
                ]
            )
        }
    }

    private static func defaultMessage(
        statusCode: Int,
        malformedResponseMessage: String
    ) -> String {
        if statusCode == 429 {
            return "Quipsly is receiving too many requests right now. Your work is safe; try again in a moment."
        }
        if statusCode >= 500 {
            return "Quipsly is temporarily unavailable. Your work is safe on this device; try again in a moment."
        }
        return malformedResponseMessage
    }

    /// Accept the common `{ error: "..." }`, Firebase
    /// `{ error: { message: "..." } }`, and `{ message: "..." }` envelopes.
    /// Limit length and reject markup so a proxy page never becomes app copy.
    private static func conciseServerMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any] else {
            return nil
        }

        let candidate: String?
        if let error = dictionary["error"] as? String {
            candidate = error
        } else if let error = dictionary["error"] as? [String: Any],
                  let message = error["message"] as? String {
            candidate = message
        } else {
            candidate = dictionary["message"] as? String
        }

        guard let normalized = candidate?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 300,
              !normalized.contains("<html"),
              !normalized.contains("<!DOCTYPE") else {
            return nil
        }
        return normalized
    }
}
