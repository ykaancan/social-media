package app.brand.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Injects the calling {@link AppPrincipal} into a controller method.
 *
 * <p>{@code required = false} yields {@code null} for an anonymous caller — only
 * {@code POST /auth/logout} needs that, because the client calls it best-effort
 * with whatever it still has.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentUser {

    boolean required() default true;
}
