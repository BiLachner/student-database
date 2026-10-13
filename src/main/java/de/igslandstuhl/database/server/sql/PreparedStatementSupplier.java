package de.igslandstuhl.database.server.sql;

import java.sql.PreparedStatement;
import java.sql.SQLException;

@FunctionalInterface
public interface PreparedStatementSupplier {
    /**
     * Prepares a SQL statement for execution.
     * @param query the SQL query to prepare
     * @return a PreparedStatement object
     * @throws SQLException if an SQL error occurs during preparation
     */
    PreparedStatement prepareStatement(String query) throws SQLException;
    public default void executeUpdate(String update) throws SQLException {
        PreparedStatement stmt = prepareStatement(update);
        // SQLite's JDBC driver can report "Query returns results" for some
        // DDL statements (notably ALTER TABLE ... ADD COLUMN ... CHECK(...))
        // even though they are schema updates. execute() is the JDBC-neutral
        // operation for migration/table scripts and handles both DDL and DML.
        stmt.execute();
        stmt.close();
    }
}
