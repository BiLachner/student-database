package de.igslandstuhl.database.api.curriculum;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class VariableFlexibleTokenDomainTest {
    @Test
    void flexibleTaskKeepsMaximumSeparateFromVariableFlag() {
        var fixed = new Curriculum.FlexibleTask(1, 2, 3, 4, 5, 6, "Fixed", 4);
        var variable = new Curriculum.FlexibleTask(2, 2, 3, 4, 5, 6, "Variable", 4, true);

        assertEquals(4, fixed.tokens());
        assertFalse(fixed.variableTokens());
        assertEquals(4, variable.tokens());
        assertTrue(variable.variableTokens());
    }

    @Test
    void completedFlexibleTaskRepresentsLegacyNullAndConcreteAwards() {
        var legacy = new Curriculum.CompletedFlexibleTask(1, "Legacy", 4);
        var awarded = new Curriculum.CompletedFlexibleTask(2, "Awarded", 4, 2);

        assertEquals(4, legacy.tokens());
        assertNull(legacy.awardedTokens());
        assertEquals(4, awarded.tokens());
        assertEquals(2, awarded.awardedTokens());
    }
}
