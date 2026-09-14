package app.brand.board;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link BoardPostState} as the lowercase text {@code board_post.state}'s CHECK allows. */
@Converter(autoApply = true)
public class BoardPostStateConverter implements AttributeConverter<BoardPostState, String> {

    @Override
    public String convertToDatabaseColumn(BoardPostState attribute) {
        return attribute == null ? null : attribute.value();
    }

    @Override
    public BoardPostState convertToEntityAttribute(String dbData) {
        return dbData == null ? null : BoardPostState.of(dbData);
    }
}
