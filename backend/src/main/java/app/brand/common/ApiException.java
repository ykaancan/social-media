package app.brand.common;

import org.springframework.http.HttpStatus;

/**
 * A failure the client is meant to see. Rendered by {@link RestExceptionHandler}
 * as {@code {code, message, field?}} [B14]. Anything else that escapes a
 * controller is a bug and becomes a 500 with the message hidden.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final String field;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(HttpStatus status, String code, String message, String field) {
        super(message);
        this.status = status;
        this.code = code;
        this.field = field;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public String field() {
        return field;
    }

    public ApiErrorBody body() {
        return new ApiErrorBody(code, getMessage(), field);
    }

    /** 422: a field the client should have caught. */
    public static ApiException validation(String message, String field) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validation", message, field);
    }

    /** 409: the client maps every 409 to {@code email_in_use}; only register shows it. */
    public static ApiException conflict(String code, String message, String field) {
        return new ApiException(HttpStatus.CONFLICT, code, message, field);
    }

    /** 401: the session is gone (or, on an auth route, the credentials were wrong). */
    public static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }

    /** 403: not allowed — including {@code approval_required} on member routes. */
    public static ApiException forbidden(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    /** 404: not visible to you. Used deliberately where "exists but not yours" must not show. */
    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "not_found", message);
    }
}
