package de.igslandstuhl.database.server.webserver.handlers;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class AdminSafeDeletionRouteTest {
    @Test void subjectDeletionDelegatesToPermissionsWhileTeacherDeletionRemainsAdminOnly() throws Exception {
        try (var input = AdminSafeDeletionRouteTest.class.getResourceAsStream("/meta/paths/post_paths.json")) {
            assertNotNull(input);
            JsonObject routes = JsonParser.parseReader(new InputStreamReader(input, StandardCharsets.UTF_8)).getAsJsonObject();
            for (String path : new String[]{"/delete-subject", "/delete-teacher"}) {
                assertTrue(routes.has(path), path);
                assertEquals("POST", routes.getAsJsonObject(path).get("type").getAsString());
                String expected = path.equals("/delete-subject") ? "user" : "admin";
                assertEquals(expected, routes.getAsJsonObject(path).get("access_level").getAsString());
            }
        }
    }
}
