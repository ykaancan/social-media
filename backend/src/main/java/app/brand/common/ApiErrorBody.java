package app.brand.common;

/**
 * [B14] The one shape of every non-2xx body: {@code {code, message, field?}}.
 *
 * <p>{@code message} is a short English string for logs — {@code http.ts} maps
 * {@code code} and the status, and the app never shows the message.
 */
public record ApiErrorBody(String code, String message, String field) {

    public static ApiErrorBody of(String code, String message) {
        return new ApiErrorBody(code, message, null);
    }
}
