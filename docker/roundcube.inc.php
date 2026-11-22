<?php
// Webmail of the demo mail server (docker/mail.sh): log in with an address of the demo and the password "demo".
$host = getenv('DEMO_MAIL_HOST') ?: '127.0.0.1';
$config['db_dsnw'] = 'sqlite:////tmp/roundcube.db?mode=0646';  // only its own notes (identities, settings); mail is on the server
$config['imap_host'] = $host . ':3143';
$config['smtp_host'] = $host . ':3025';
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['des_key'] = 'polier-demo-webmail-0001';
$config['product_name'] = 'Polier demo mail';
$config['plugins'] = [];
$config['sent_mbox'] = 'Sent Items';
$config['trash_mbox'] = 'Deleted Items';
$config['junk_mbox'] = 'Junk Mail';
$config['drafts_mbox'] = 'Drafts';
$config['temp_dir'] = '/tmp';
$config['log_driver'] = 'stdout';
$config['enable_installer'] = false;
$config['language'] = 'de_DE';
$config['ip_check'] = false;      // behind the app's proxy every request comes from the same address anyway
$config['use_https'] = false;
