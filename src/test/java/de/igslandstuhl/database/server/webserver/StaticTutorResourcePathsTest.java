package de.igslandstuhl.database.server.webserver;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import de.igslandstuhl.database.Registry;
import de.igslandstuhl.database.api.User;
import de.igslandstuhl.database.server.resources.ResourceLocation;
import de.igslandstuhl.database.server.webserver.access.AccessLevel;
import de.igslandstuhl.database.server.webserver.handlers.PostRequestHandler;
import de.igslandstuhl.database.server.webserver.handlers.WebResourceHandler;
import de.igslandstuhl.database.server.webserver.requests.RequestType;

class StaticTutorResourcePathsTest {
    @BeforeAll
    static void registerWebPaths() throws IOException {
        WebPath.registerPaths();
        PostRequestHandler.getInstance().registerHandlers();
    }

    @Test
    void weeklyConversationsIsRegisteredAsTeacherJavascriptResource() {
        assertPath("/weekly-conversations.js", "teacher", AccessLevel.TEACHER,
                "teacher", "weekly-conversations.js");
    }

    @Test
    void tutorAssignmentsIsRegisteredAsAdminJavascriptResource() {
        assertPath("/tutor-assignments.js", "admin", AccessLevel.ADMIN,
                "admin", "tutor-assignments.js");
    }

    @Test
    void dashboardJavascriptResourcesUseTheirRegisteredResourceSemantics() {
        assertPath("/admin-dashboard.js", "admin", AccessLevel.ADMIN,
                "admin", "admin-dashboard.js");
        assertPath("/curriculum.js", "site", AccessLevel.TEACHER,
                "site", "curriculum.js");
        assertPath("/student-individual-matrix.js", "admin", AccessLevel.ADMIN,
                "admin", "student-individual-matrix.js");
    }

    @Test
    void enrollmentApisAreRegisteredAsPostHandlersWithCoreAccessLevels() {
        Map<String, AccessLevel> expectedAccess = Map.ofEntries(
                Map.entry("/curriculum-enrollment-catalog", AccessLevel.ADMIN),
                Map.entry("/curriculum-course-groups", AccessLevel.ADMIN),
                Map.entry("/curriculum-tutor-assignments", AccessLevel.USER),
                Map.entry("/assign-class-tutors", AccessLevel.USER),
                Map.entry("/assign-class-subject-teacher", AccessLevel.ADMIN),
                Map.entry("/assign-individual-grade-teacher", AccessLevel.ADMIN),
                Map.entry("/assign-grade-curriculum", AccessLevel.ADMIN),
                Map.entry("/create-curriculum-semester", AccessLevel.USER),
                Map.entry("/activate-curriculum-semester", AccessLevel.USER),
                Map.entry("/remove-grade-curriculum-subject", AccessLevel.ADMIN),
                Map.entry("/set-curriculum-subject-type", AccessLevel.USER),
                Map.entry("/curriculum-individual-student-matrix", AccessLevel.ADMIN),
                Map.entry("/assign-curriculum-individual-subject", AccessLevel.ADMIN));
        for (String path : expectedAccess.keySet()) {
            WebPath webPath = Registry.webPathRegistry().get(WebPath.PathInfo.get(path, RequestType.POST));
            assertNotNull(webPath, path + " must be registered");
            assertEquals(RequestType.POST, webPath.type());
            assertEquals("PostRequestHandler", webPath.handlerType());
            assertEquals(expectedAccess.get(path), webPath.accessLevel());
            assertNotNull(Registry.postRequestHandlerRegistry().get(path), path + " handler must be registered");
        }
    }

    @Test
    void subjectManagementApisHaveRegisteredPostHandlers() {
        for (String path : new String[]{
                "/subject-management-catalog", "/set-subject-grade-activations",
                "/set-curriculum-subject-type", "/add-subject-with-type",
                "/edit-subject", "/delete-subject"}) {
            WebPath webPath = Registry.webPathRegistry().get(WebPath.PathInfo.get(path, RequestType.POST));
            assertNotNull(webPath, path + " must be registered");
            assertEquals(RequestType.POST, webPath.type());
            assertEquals("PostRequestHandler", webPath.handlerType());
            assertNotNull(Registry.postRequestHandlerRegistry().get(path), path + " handler must be registered");
        }
    }

    private static void assertPath(String path, String namespace, AccessLevel accessLevel,
            String expectedResourceNamespace, String expectedResourceName) {
        WebPath webPath = Registry.webPathRegistry().get(WebPath.PathInfo.get(path, RequestType.GET));
        assertNotNull(webPath, path + " must be registered");
        assertEquals(RequestType.GET, webPath.type());
        assertEquals("FileRequestHandler", webPath.handlerType());
        assertTrue(webPath.namespaces().contains(namespace));
        assertEquals("js", webPath.context());
        assertEquals(accessLevel, webPath.accessLevel());

        ResourceLocation location = WebResourceHandler.locationFromPath(path, User.ANONYMOUS);
        assertEquals("js", location.context());
        assertEquals(expectedResourceNamespace, location.namespace());
        assertEquals(expectedResourceName, location.resource());
    }
}
