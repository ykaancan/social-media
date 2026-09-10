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
 * [D7]/[B14] Member routes require an {@code approved} account; anything else is
 * {@code 403 approval_required}. There is no approved-but-read-only state, so this
 * is one flat rule rather than a per-endpoint check.
 *
 * <p>The exceptions are the routes the onboarding shell itself runs on, which have
 * to work while the account is {@code incomplete}, {@code pending} or
 * {@code rejected}: {@code /me}, {@code /me/profile}, {@code /me/photo},
 * {@code /auth/logout} and {@code /sections/**} (the profile setup screen needs the
 * section picker before there is any approval at all).
 *
 * <p>An anonymous request passes straight through: whether it is a 401 is the
 * authorization rules' decision, not this filter's.
 */
@Component
public class ApprovedMemberFilter extends OncePerRequestFilter {

    /** Reachable by any signed-in status. */
    private static final Set<String> ANY_STATUS_PATHS = Set.of(
            "/me",
            "/me/profile",
            "/me/photo",
            "/auth/logout");

    /** Prefixes that are either public or status-independent. */
    private static final List<String> ANY_STATUS_PREFIXES = List.of(
            "/auth/",
            "/sections",
            "/reset",
            "/media/",
            "/actuator/",
            "/admin",
            "/ws",
            "/error");

    private final SecurityErrorResponder responder;

    public ApprovedMemberFilter(SecurityErrorResponder responder) {
        this.responder = responder;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();

        if (principal instanceof AppPrincipal current
                && !current.isApproved()
                && !isStatusIndependent(request)) {
            responder.write(response, HttpStatus.FORBIDDEN,
                    ApiErrorBody.of("approval_required", "account is not approved"));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static boolean isStatusIndependent(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        if (ANY_STATUS_PATHS.contains(path)) {
            return true;
        }
        for (String prefix : ANY_STATUS_PREFIXES) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
