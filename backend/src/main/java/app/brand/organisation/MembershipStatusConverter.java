package app.brand.organisation;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link MembershipStatus} as the lowercase text the CHECK constraint allows. */
@Converter(autoApply = true)
public class MembershipStatusConverter implements AttributeConverter<MembershipStatus, String> {

    @Override
    public String convertToDatabaseColumn(MembershipStatus attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public MembershipStatus convertToEntityAttribute(String dbData) {
        return dbData == null ? null : MembershipStatus.of(dbData);
    }
}
