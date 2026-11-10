package app.brand.security;

import app.brand.common.ApiErrorBody;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * [D14]/[D18]/[B14] Member routes require a confirmed email and an {@code active}
 * account. One flat rule rather than a per-endpoint check, applied in this order:
 *
 * <ol>
 *   <li>email not confirmed → {@code 403 email_unconfirmed} [D18], on every route
 *       except the few an unconfirmed account needs to get confirmed (below);</li>
 *   <li>confirmed but not {@code active} ({@code incomplete} or {@code banned}) →
 *       {@code 403 account_not_active}, on every route except the onboarding
 *       shell's.</li>
 * </ol>
 *
 * <p>Organisation membership is <em>not</em> checked here [D14]: an active account
 * with no membership at all passes, and every board, wall and people route checks
 * event membership on its own ({@code EventAccess.requireMember}).
 *
 * <p><b>[D18] An unconfirmed account</b> reaches only: its own {@code GET /me}
 * (so the app knows to show the confirm screen), everything under {@code /auth/}
 * (including {@code /auth/resend-confirmation} and {@code /auth/logout}), the
 * confirmation page {@code /confirm}, and what is public to a signed-out caller
 * anyway — {@code /reset}, {@code /media/}, {@code /actuator/}, {@code /error}
 * and the static admin page. Profile setup, the photo, {@code /sections/**} and
 * the {@code /ws} handshake are refused: they come after confirmation (P1).
 *
 * <p><b>A confirmed account that is {@code incomplete} or {@code banned}</b>
 * additionally reaches {@code /me} (any method), {@code /me/profile},
 * {@code /me/photo}, {@code /sections/**} and {@code /ws} — the routes the
 * profile-setup screen runs on.
 *
 * <p>The admin exemption is the static page only — {@code /admin}, {@code /admin/},
 * {@code /admin/index.html} and the one-segment {@code *.css} / {@code *.js} beside
 * it, exactly what {@code SecurityConfig} makes public. {@code /admin/api/**} is
 * checked like every other route, so a banned or unconfirmed {@code super_admin}
 * gets a 403 and not the admin API.
 *
 * <p>An anonymous request passes straight through: whether it is a 401 is the
 * authorization rules' decision, not this filter's.
 */
@Component
public class ActiveAccountFilter extends OncePerRequestFilter {

    /** [D18] Prefixes an unconfirmed account reaches: auth, confirmation and the public routes. */
    private static final List<String> UNCONFIRMED_PREFIXES = List.of(
            "/auth/",
            // [D18] the page a confirmation link opens.
            "/confirm",
            "/reset",
            "/media/",
            "/actuator/",
            "/error");

    /** Paths a confirmed account reaches while {@code incomplete} or {@code banned}. */
    private static final Set<String> NOT_ACTIVE_PATHS = Set.of(
            "/me",
            "/me/profile",
            "/me/photo");

    /** Prefixes a confirmed account reaches while {@code incomplete} or {@code banned}. */
    private static final List<String> NOT_ACTIVE_PREFIXES = List.of(
            "/sections",
            "/ws");

    /** The static admin page, and nothing under {@code /admin/api}. */
    private static final Set<String> ADMIN_PAGE_PATHS = Set.of(
            "/admin",
            "/admin/",
            "/admin/index.html");

    private static final String ADMIN_PREFIX = "/admin/";

    private final SecurityErrorResponder responder;

    public ActiveAccountFilter(SecurityErrorResponder responder) {
        this.responder = responder;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();

        if (principal instanceof AppPrincipal current) {
            String path = pathOf(request);
            if (!current.emailConfirmed() && !reachableUnconfirmed(request.getMethod(), path)) {
                responder.write(response, HttpStatus.FORBIDDEN,
                        ApiErrorBody.of("email_unconfirmed", "email is not confirmed"));
                return;
            }
            if (current.emailConfirmed() && !current.isActive() && !reachableNotActive(request.getMethod(), path)) {
                responder.write(response, HttpStatus.FORBIDDEN,
                        ApiErrorBody.of("account_not_active", "account is not active"));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        return path;
    }

    /** [D18] Own {@code GET /me}, auth, confirmation, and the public routes. */
    private static boolean reachableUnconfirmed(String method, String path) {
        if ("/me".equals(path) && "GET".equalsIgnoreCase(method)) {
            return true;
        }
        return startsWithAny(path, UNCONFIRMED_PREFIXES) || isAdminPageAsset(path);
    }

    /** Everything an unconfirmed account reaches, plus the profile-setup routes. */
    private static boolean reachableNotActive(String method, String path) {
        return reachableUnconfirmed(method, path)
                || NOT_ACTIVE_PATHS.contains(path)
                || startsWithAny(path, NOT_ACTIVE_PREFIXES);
    }

    private static boolean startsWithAny(String path, List<String> prefixes) {
        for (String prefix : prefixes) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Mirrors the {@code /admin/*.css} and {@code /admin/*.js} matchers in
     * {@code SecurityConfig}: one segment under {@code /admin/}, so
     * {@code /admin/api/users} can never match.
     */
    private static boolean isAdminPageAsset(String path) {
        if (ADMIN_PAGE_PATHS.contains(path)) {
            return true;
        }
        if (!path.startsWith(ADMIN_PREFIX)) {
            return false;
        }
        String rest = path.substring(ADMIN_PREFIX.length());
        if (rest.indexOf('/') >= 0) {
            return false;
        }
        return rest.endsWith(".css") || rest.endsWith(".js");
    }
}
