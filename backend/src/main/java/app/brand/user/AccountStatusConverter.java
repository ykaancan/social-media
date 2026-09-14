package app.brand.user;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link AccountStatus} as the lowercase text the CHECK constraint allows. */
@Converter(autoApply = true)
public class AccountStatusConverter implements AttributeConverter<AccountStatus, String> {

    @Override
    public String convertToDatabaseColumn(AccountStatus attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public AccountStatus convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AccountStatus.of(dbData);
    }
}
