use serde_json::Value;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 4710;
const TIMEOUT: Duration = Duration::from_millis(1500);

/** Send a NUL-terminated command to UAMixerEngine and return the parsed JSON response. */
pub fn apollo_cmd(cmd: &str) -> Option<Value> {
    let mut stream = TcpStream::connect((HOST, PORT)).ok()?;
    stream.set_read_timeout(Some(TIMEOUT)).ok()?;
    stream.set_write_timeout(Some(TIMEOUT)).ok()?;

    let mut payload = cmd.as_bytes().to_vec();
    payload.push(0u8);
    stream.write_all(&payload).ok()?;

    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match stream.read(&mut byte) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                if byte[0] == 0 {
                    break;
                }
                buf.push(byte[0]);
            }
        }
    }

    if buf.is_empty() {
        return None;
    }
    serde_json::from_slice(&buf).ok()
}

/** Get a control value at path. Returns the "data" field from the SDK response. */
pub fn apollo_get(path: &str) -> Option<Value> {
    let resp = apollo_cmd(&format!("get {}", path))?;
    resp.get("data").cloned()
}

/** Set a control value at path. Returns the confirmed "data" field. */
pub fn apollo_set(path: &str, value: &Value) -> Option<Value> {
    let val_str = match value {
        Value::Bool(b) => if *b { "true".into() } else { "false".into() },
        Value::Number(n) => format!("{:.4}", n.as_f64().unwrap_or(0.0)),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    let resp = apollo_cmd(&format!("set {} {}", path, val_str))?;
    resp.get("data").cloned()
}

/** Check if UAMixerEngine is reachable on port 4710. */
pub fn is_sdk_available() -> bool {
    TcpStream::connect_timeout(
        &format!("{}:{}", HOST, PORT).parse().unwrap(),
        Duration::from_millis(500),
    )
    .is_ok()
}
