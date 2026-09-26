<?php
defined('EMT') or exit;

/** Tiny PDO wrapper. All tables use the `emt_` prefix. */
class DB
{
    /** @var PDO|null */
    private static $pdo = null;

    public static function connect(array $db)
    {
        $dsn = 'mysql:host=' . $db['host'] . ';port=' . (int) (isset($db['port']) ? $db['port'] : 3306)
            . ';dbname=' . $db['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $db['user'], $db['pass'], array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ));
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'ONLY_FULL_GROUP_BY', ''), 'NO_ZERO_DATE', '')");
        return $pdo;
    }

    public static function setPdo(PDO $pdo)
    {
        self::$pdo = $pdo;
    }

    /** @return PDO */
    public static function pdo()
    {
        if (self::$pdo === null) {
            $config = emt_config();
            if (!$config) {
                throw new RuntimeException('Application is not installed.');
            }
            self::$pdo = self::connect($config['db']);
        }
        return self::$pdo;
    }

    /** @return PDOStatement */
    public static function q($sql, array $params = array())
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function one($sql, array $params = array())
    {
        $row = self::q($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function all($sql, array $params = array())
    {
        return self::q($sql, $params)->fetchAll();
    }

    public static function val($sql, array $params = array())
    {
        $v = self::q($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function col($sql, array $params = array())
    {
        return self::q($sql, $params)->fetchAll(PDO::FETCH_COLUMN);
    }

    /** Executes and returns affected row count. */
    public static function exec($sql, array $params = array())
    {
        return self::q($sql, $params)->rowCount();
    }

    public static function insert($table, array $data)
    {
        $cols = array_keys($data);
        $sql = 'INSERT INTO ' . $table . ' (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
        self::q($sql, array_values($data));
        return (int) self::pdo()->lastInsertId();
    }

    public static function update($table, array $data, $where, array $whereParams = array())
    {
        $sets = array();
        foreach (array_keys($data) as $c) {
            $sets[] = '`' . $c . '` = ?';
        }
        $sql = 'UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE ' . $where;
        return self::exec($sql, array_merge(array_values($data), $whereParams));
    }

    /** Builds "?,?,?" placeholders for IN() clauses. */
    public static function in(array $values)
    {
        return implode(',', array_fill(0, max(1, count($values)), '?'));
    }

    public static function tx($fn)
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
