package app.brand.common;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * [B14] Every non-2xx body is {@code {code, message, field?}} and nothing else.
 *
 * <p>The status codes are the ones {@code http.ts} already maps:
 * 401 session gone / wrong credentials, 403 not allowed, 404 not visible to you,
 * 409 conflict, 422 validation or refused delivery, 429 rate limit.
 */
@RestControllerAdvice
public class RestExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(RestExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorBody> handleApi(ApiException ex) {
        return ResponseEntity.status(ex.status()).body(ex.body());
    }

    /** Bean validation on a request body: the field name is what the client needs. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorBody> handleInvalidBody(MethodArgumentNotValidException ex) {
        FieldError first = ex.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
        String message = first != null ? first.getDefaultMessage() : "invalid request";
        String field = first != null ? first.getField() : null;
        return unprocessable(message, field);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiErrorBody> handleInvalidParams(HandlerMethodValidationException ex) {
        return unprocessable(firstMessage(ex), null);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorBody> handleViolations(ConstraintViolationException ex) {
        ConstraintViolation<?> first = ex.getConstraintViolations().stream().findFirst().orElse(null);
        if (first == null) {
            return unprocessable("invalid request", null);
        }
        String path = first.getPropertyPath().toString();
        String field = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1) : path;
        return unprocessable(first.getMessage(), field.isBlank() ? null : field);
    }

    /** Malformed JSON is the client's fault, not a server error. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorBody> handleUnreadable(HttpMessageNotReadableException ex) {
        return unprocessable("malformed request body", null);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiErrorBody> handleMissingParam(MissingServletRequestParameterException ex) {
        return unprocessable("missing parameter", ex.getParameterName());
    }

    /** [B10] 5 MB avatar cap; a bigger upload is a validation failure, not a 500. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorBody> handleTooLarge(MaxUploadSizeExceededException ex) {
        return unprocessable("file too large", "photo");
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiErrorBody> handleAuthentication(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ApiErrorBody.of("unauthorized", "authentication required"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiErrorBody> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiErrorBody.of("forbidden", "not allowed"));
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<ApiErrorBody> handleNotFound(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiErrorBody.of("not_found", "not found"));
    }

    /**
     * Anything else is a bug. The real message is logged, never returned: an
     * exception string can carry an email, a token or a query.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorBody> handleUnknown(Exception ex) {
        log.error("unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiErrorBody.of("unknown", "unexpected error"));
    }

    private static ResponseEntity<ApiErrorBody> unprocessable(String message, String field) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ApiErrorBody("validation", message == null ? "invalid request" : message, field));
    }

    private static String firstMessage(HandlerMethodValidationException ex) {
        return ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream())
                .map(MessageSourceResolvable::getDefaultMessage)
                .filter(message -> message != null && !message.isBlank())
                .findFirst()
                .orElse("invalid request");
    }
}
