<?php
defined('EMT') or exit;

/**
 * Imports email addresses into an Email House from pasted text or CSV files.
 * Validates syntax, removes duplicates and applies the global suppression list.
 */
class Importer
{
    const BATCH = 1000;

    private $listId;
    private $seen = array();
    private $batch = array();
    public $stats = array(
        'processed' => 0,
        'added' => 0,
        'duplicates' => 0,
        'invalid' => 0,
        'suppressed' => 0,
        'invalid_samples' => array(),
    );

    public function __construct($listId)
    {
        $this->listId = (int) $listId;
    }

    /** Pasted text: one contact per line, "email", "Name <email>", "email, Name" or "Name, email"; or many emails per line. */
    public function importText($text)
    {
        $lines = preg_split('/\r\n|\r|\n/', (string) $text);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            foreach (self::parseLine($line) as $pair) {
                $this->add($pair[0], $pair[1]);
            }
        }
        return $this->finish();
    }

    /** Parses a free-form line into [email, name] pairs. */
    public static function parseLine($line)
    {
        // "Name <email>" (possibly several, comma separated)
        if (preg_match_all('/("?)([^",;<>]*)\1\s*<([^<>\s]+@[^<>\s]+)>/', $line, $m, PREG_SET_ORDER)) {
            $out = array();
            foreach ($m as $match) {
                $out[] = array($match[3], trim($match[2]));
            }
            return $out;
        }
        $parts = array_map('trim', preg_split('/[,;\t|]+/', $line));
        $parts = array_values(array_filter($parts, function ($p) {
            return $p !== '';
        }));
        $emails = array();
        $others = array();
        foreach ($parts as $p) {
            if (strpos($p, '@') !== false) {
                // Several addresses separated by spaces are allowed too.
                foreach (preg_split('/\s+/', $p) as $token) {
                    if (strpos($token, '@') !== false) {
                        $emails[] = $token;
                    }
                }
            } else {
                $others[] = trim($p, " \"'");
            }
        }
        if (!$emails) {
            // Keep invalid lines so they are counted as invalid.
            return array(array($line, ''));
        }
        if (count($emails) === 1) {
            return array(array($emails[0], $others ? implode(' ', array_slice($others, 0, 2)) : ''));
        }
        $out = array();
        foreach ($emails as $e) {
            $out[] = array($e, '');
        }
        return $out;
    }

    /** CSV upload. Detects delimiter and header row (email / name / first name / last name columns). */
    public function importCsv($path)
    {
        $fh = fopen($path, 'r');
        if (!$fh) {
            throw new RuntimeException('Could not read the uploaded file.');
        }
        $first = fgets($fh);
        if ($first === false) {
            fclose($fh);
            return $this->finish();
        }
        $first = preg_replace('/^\xEF\xBB\xBF/', '', $first);
        $delimiter = ',';
        $best = 0;
        foreach (array(',', ';', "\t", '|') as $d) {
            $c = substr_count($first, $d);
            if ($c > $best) {
                $best = $c;
                $delimiter = $d;
            }
        }
        $headerRow = str_getcsv(trim($first), $delimiter, '"', '\\');
        $hasHeader = strpos($first, '@') === false;
        $emailCol = null;
        $nameCol = null;
        $firstCol = null;
        $lastCol = null;
        if ($hasHeader) {
            foreach ($headerRow as $i => $label) {
                $l = strtolower(trim($label));
                $l = preg_replace('/[^a-z]/', '', $l);
                if ($emailCol === null && preg_match('/^(email|emailaddress|mail|emailid|e?mailaddr)$/', $l)) {
                    $emailCol = $i;
                } elseif ($emailCol === null && strpos($l, 'email') !== false) {
                    $emailCol = $i;
                } elseif ($nameCol === null && preg_match('/^(name|fullname|contactname|displayname)$/', $l)) {
                    $nameCol = $i;
                } elseif ($firstCol === null && preg_match('/^(first|firstname|fname|givenname)$/', $l)) {
                    $firstCol = $i;
                } elseif ($lastCol === null && preg_match('/^(last|lastname|lname|surname|familyname)$/', $l)) {
                    $lastCol = $i;
                }
            }
        } else {
            rewind($fh);
            $bom = fread($fh, 3);
            if ($bom !== "\xEF\xBB\xBF") {
                rewind($fh);
            }
        }
        while (($row = fgetcsv($fh, 0, $delimiter, '"', '\\')) !== false) {
            if ($row === array(null) || !$row) {
                continue;
            }
            $email = null;
            $name = '';
            if ($emailCol !== null) {
                $email = isset($row[$emailCol]) ? $row[$emailCol] : '';
            } else {
                foreach ($row as $i => $cell) {
                    if (strpos((string) $cell, '@') !== false) {
                        $email = $cell;
                        if ($nameCol === null && $firstCol === null) {
                            // take the first other non-empty cell as name
                            foreach ($row as $j => $c2) {
                                if ($j !== $i && trim((string) $c2) !== '' && strpos((string) $c2, '@') === false) {
                                    $name = $c2;
                                    break;
                                }
                            }
                        }
                        break;
                    }
                }
                if ($email === null) {
                    $email = isset($row[0]) ? $row[0] : '';
                }
            }
            if ($nameCol !== null && isset($row[$nameCol])) {
                $name = $row[$nameCol];
            } elseif ($firstCol !== null || $lastCol !== null) {
                $name = trim(($firstCol !== null && isset($row[$firstCol]) ? $row[$firstCol] : '') . ' ' . ($lastCol !== null && isset($row[$lastCol]) ? $row[$lastCol] : ''));
            }
            if (trim((string) $email) === '' && trim(implode('', $row)) === '') {
                continue;
            }
            $this->add($email, $name);
        }
        fclose($fh);
        return $this->finish();
    }

    public function add($email, $name = '')
    {
        $this->stats['processed']++;
        $raw = trim((string) $email);
        // Strip "mailto:" and surrounding junk
        $raw = preg_replace('/^mailto:/i', '', $raw);
        $email = Util::normalizeEmail($raw);
        if (!Util::isValidEmail($email)) {
            $this->stats['invalid']++;
            if (count($this->stats['invalid_samples']) < 50) {
                $this->stats['invalid_samples'][] = Util::truncate($raw, 80);
            }
            return;
        }
        if (isset($this->seen[$email])) {
            $this->stats['duplicates']++;
            return;
        }
        $this->seen[$email] = true;
        $name = trim(preg_replace('/\s+/', ' ', strip_tags((string) $name)), " \"'");
        if (function_exists('mb_substr')) {
            $name = mb_substr($name, 0, 190);
        }
        $this->batch[] = array($email, $name);
        if (count($this->batch) >= self::BATCH) {
            $this->flush();
        }
    }

    private function flush()
    {
        if (!$this->batch) {
            return;
        }
        $now = Util::now();
        $placeholders = array();
        $params = array();
        foreach ($this->batch as $row) {
            $placeholders[] = '(?, ?, ?, ?, ?)';
            array_push($params, $this->listId, $row[0], $row[1], 'active', $now);
        }
        $sql = 'INSERT IGNORE INTO emt_contacts (list_id, email, name, status, created_at) VALUES ' . implode(',', $placeholders);
        $inserted = DB::q($sql, $params)->rowCount();
        $this->stats['added'] += $inserted;
        $this->stats['duplicates'] += count($this->batch) - $inserted;
        $this->batch = array();
    }

    private function finish()
    {
        $this->flush();
        $this->stats['suppressed'] = Suppression::applyToList($this->listId);
        DB::exec('UPDATE emt_lists SET updated_at = ? WHERE id = ?', array(Util::now(), $this->listId));
        return $this->stats;
    }
}
