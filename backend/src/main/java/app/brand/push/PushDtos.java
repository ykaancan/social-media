package app.brand.push;

/**
 * The one request body the push layer accepts. It is not in {@code types.ts}
 * because it is not a product surface: nothing about it is ever rendered.
 */
public final class PushDtos {

    private PushDtos() {
    }

    /**
     * {@code PUT /me/devices}. {@code platform} is {@code ios | android | web};
     * {@code locale} is the app's current i18n language, {@code en} or {@code tr}.
     */
    public record RegisterDeviceRequest(String token, String platform, String locale) {
    }
}
