<?php
defined('EMT') or exit;

/**
 * Minimal POP3 client (RFC 1939 + STLS) used to read bounce messages.
 * Implemented with plain sockets so it works without the php-imap extension.
 */
class Pop3
{
    private $fp = null;

    public function connect($host, $port, $secure = 'ssl', $timeout = 20)
    {
        $host = trim($host);
        $port = (int) $port;
        $ctx = stream_context_create(array('ssl' => array(
            'verify_peer' => true,
            'verify_peer_name' => true,
            'SNI_enabled' => true,
            'peer_name' => $host,
        )));
        $target = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client($target, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            throw new RuntimeException('Could not connect to ' . $host . ':' . $port . ' — ' . ($errstr ?: 'connection failed'));
        }
        stream_set_timeout($fp, $timeout);
        $this->fp = $fp;
        $greeting = $this->readLine();
        if (strpos($greeting, '+OK') !== 0) {
            throw new RuntimeException('Unexpected POP3 greeting: ' . $greeting);
        }
        if ($secure === 'tls') {
            $this->command('STLS');
            $method = STREAM_CRYPTO_METHOD_TLS_CLIENT;
            if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                $method |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
            }
            if (!@stream_socket_enable_crypto($fp, true, $method)) {
                throw new RuntimeException('Could not start TLS encryption with the POP3 server.');
            }
        }
    }

    public function login($user, $pass)
    {
        $this->command('USER ' . $user);
        try {
            $this->command('PASS ' . $pass);
        } catch (RuntimeException $e) {
            throw new RuntimeException('POP3 login failed — check the mailbox username/password. (' . $e->getMessage() . ')');
        }
    }

    /** @return int[] message number => size */
    public function listSizes()
    {
        $out = array();
        foreach ($this->multiline('LIST') as $line) {
            $p = explode(' ', trim($line));
            if (count($p) >= 2) {
                $out[(int) $p[0]] = (int) $p[1];
            }
        }
        return $out;
    }

    /** @return string[] message number => unique id */
    public function uidl()
    {
        $out = array();
        foreach ($this->multiline('UIDL') as $line) {
            $p = explode(' ', trim($line), 2);
            if (count($p) === 2) {
                $out[(int) $p[0]] = $p[1];
            }
        }
        return $out;
    }

    public function top($num, $lines = 0)
    {
        return implode("\r\n", $this->multiline('TOP ' . (int) $num . ' ' . (int) $lines));
    }

    public function retr($num)
    {
        return implode("\r\n", $this->multiline('RETR ' . (int) $num));
    }

    public function dele($num)
    {
        $this->command('DELE ' . (int) $num);
    }

    public function quit()
    {
        if ($this->fp) {
            try {
                $this->command('QUIT');
            } catch (Exception $e) {
                // ignore
            }
            @fclose($this->fp);
            $this->fp = null;
        }
    }

    private function readLine()
    {
        $line = fgets($this->fp);
        if ($line === false) {
            $meta = stream_get_meta_data($this->fp);
            throw new RuntimeException(!empty($meta['timed_out']) ? 'POP3 server timed out.' : 'POP3 connection closed unexpectedly.');
        }
        return rtrim($line, "\r\n");
    }

    private function command($cmd)
    {
        fwrite($this->fp, $cmd . "\r\n");
        $resp = $this->readLine();
        if (strpos($resp, '+OK') !== 0) {
            $shown = stripos($cmd, 'PASS ') === 0 ? 'PASS ****' : $cmd;
            throw new RuntimeException($shown . ' → ' . $resp);
        }
        return $resp;
    }

    /** Sends a command whose answer is a dot-terminated multi-line block. */
    private function multiline($cmd)
    {
        $this->command($cmd);
        $lines = array();
        while (true) {
            $line = $this->readLine();
            if ($line === '.') {
                break;
            }
            if (isset($line[0]) && $line[0] === '.') {
                $line = substr($line, 1); // dot-unstuffing
            }
            $lines[] = $line;
        }
        return $lines;
    }
}
