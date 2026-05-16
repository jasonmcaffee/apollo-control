use crate::config::Action;
use crate::sdk::{apollo_get, apollo_set};
use serde_json::Value;

/** Execute an action against the UA Console SDK. Returns a human-readable error on failure. */
pub fn execute_action(action: &Action) -> Result<(), String> {
    match action {
        Action::Toggle { path } => execute_toggle(path),
        Action::Step { path, delta, min, max } => execute_step(path, *delta, *min, *max),
        Action::Set { path, value } => execute_set(path, value),
        Action::Hold { path, press_value, .. } => execute_set(path, press_value),
        Action::Knob { .. } => Ok(()), // Knob is handled by the scroll hook with a direction
    }
}

/** Apply a Knob action in the given direction (+1.0 = increase, -1.0 = decrease). */
pub fn execute_knob_step(action: &Action, direction: f64) -> Result<(), String> {
    if let Action::Knob { path, step, min, max } = action {
        execute_step(path, direction * step, *min, *max)
    } else {
        Err("Not a Knob action".to_string())
    }
}

/** Execute the release side of a Hold action (restores the release_value). */
pub fn execute_hold_release(action: &Action) -> Result<(), String> {
    if let Action::Hold { path, release_value, .. } = action {
        execute_set(path, release_value)
    } else {
        Ok(())
    }
}

fn execute_toggle(path: &str) -> Result<(), String> {
    let current = apollo_get(path).ok_or("SDK get failed")?;
    let new_val = match &current {
        Value::Bool(b) => Value::Bool(!b),
        Value::Number(n) => {
            let v = n.as_f64().unwrap_or(0.0);
            Value::Bool(v == 0.0)
        }
        _ => return Err(format!("Cannot toggle non-bool value: {:?}", current)),
    };
    apollo_set(path, &new_val).ok_or("SDK set failed")?;
    Ok(())
}

fn execute_step(path: &str, delta: f64, min: f64, max: f64) -> Result<(), String> {
    let current = apollo_get(path).ok_or("SDK get failed")?;
    let current_f = match &current {
        Value::Number(n) => n.as_f64().unwrap_or(0.0),
        _ => return Err(format!("Cannot step non-numeric value: {:?}", current)),
    };
    let new_val = (current_f + delta).clamp(min, max);
    let json_val = serde_json::Number::from_f64(new_val)
        .map(Value::Number)
        .ok_or("Invalid float value")?;
    apollo_set(path, &json_val).ok_or("SDK set failed")?;
    Ok(())
}

fn execute_set(path: &str, value: &Value) -> Result<(), String> {
    apollo_set(path, value).ok_or_else(|| "SDK set failed".to_string())?;
    Ok(())
}
