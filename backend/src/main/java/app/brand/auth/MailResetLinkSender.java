package app.brand.auth;

import app.brand.config.BrandProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends the reset link by SMTP when {@code brand.mail.enabled} is true, and
 * otherwise logs it at INFO.
 *
 * <p>The logged link carries a live token, so this is a development and
 * pre-launch affordance only — BACKEND_PLAN.md §6 lists SMTP credentials as one of
 * the things that need the founder. Turning mail on turns the logging off.
 */
@Component
public class MailResetLinkSender implements ResetLinkSender {

    private static final Logger log = LoggerFactory.getLogger(MailResetLinkSender.class);

    private final BrandProperties properties;
    private final ObjectProvider<JavaMailSender> mailSender;

    public MailResetLinkSender(BrandProperties properties, ObjectProvider<JavaMailSender> mailSender) {
        this.properties = properties;
        this.mailSender = mailSender;
    }

    @Override
    public void send(String email, String link) {
        if (!properties.mail().enabled()) {
            log.info("Password reset requested for {} — mail is disabled, link: {}", email, link);
            return;
        }
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.warn("brand.mail.enabled is true but no JavaMailSender is configured (set SPRING_MAIL_HOST); "
                    + "logging the link for {} instead", email);
            log.info("Password reset link: {}", link);
            return;
        }
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mail().from());
        message.setTo(email);
        message.setSubject("Reset your password");
        message.setText("Open this link to choose a new password. It expires in one hour.\n\n" + link + "\n");
        sender.send(message);
        log.info("Password reset mail sent to {}", email);
    }
}
