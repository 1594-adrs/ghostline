//! Default overlay bounds per mode, computed on the monitor work area (physical pixels).

use crate::ipc::{OverlayMode, Rect};

fn px(v: f64) -> u32 {
    v.round().max(1.0) as u32
}

fn to_i32(v: i64) -> i32 {
    v.clamp(i32::MIN as i64, i32::MAX as i64) as i32
}

/// `work` is the monitor work area (taskbar excluded); `scale` is the monitor DPI factor (min sizes and margin are logical px).
/// Arithmetic is done in i64 so no input can overflow.
pub fn default_rect(mode: OverlayMode, work: Rect, scale: f64) -> Rect {
    let (w, h) = (work.width as f64, work.height as f64);
    let (x0, y0, ww) = (work.x as i64, work.y as i64, work.width as i64);
    match mode {
        OverlayMode::Corner => {
            let width = px((w * 0.34).max(420.0 * scale)).min(work.width);
            let height = px((h * 0.30).max(220.0 * scale)).min(work.height);
            let margin = (24.0 * scale).round() as i64;
            Rect {
                x: to_i32(x0 + ww - width as i64 - margin),
                y: to_i32(y0 + margin),
                width,
                height,
            }
        }
        OverlayMode::Strip => {
            let width = px(w * 0.60).min(work.width);
            Rect {
                x: to_i32(x0 + (ww - width as i64) / 2),
                y: work.y,
                width,
                height: px(h * 0.18).min(work.height),
            }
        }
        OverlayMode::Full => work,
    }
}

/// True when the rect overlaps the area at all (guards saved bounds from a monitor that is gone).
pub fn intersects(a: Rect, b: Rect) -> bool {
    let end = |p: i32, len: u32| p as i64 + len as i64;
    (a.x as i64) < end(b.x, b.width)
        && (b.x as i64) < end(a.x, a.width)
        && (a.y as i64) < end(b.y, b.height)
        && (b.y as i64) < end(a.y, a.height)
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };

    #[test]
    fn corner_top_right_with_margin() {
        let r = default_rect(OverlayMode::Corner, WORK, 1.0);
        assert_eq!(
            r,
            Rect {
                x: 1920 - 653 - 24,
                y: 24,
                width: 653,
                height: 312
            }
        );
    }

    #[test]
    fn corner_respects_minimums() {
        let small = Rect {
            width: 800,
            height: 600,
            ..WORK
        };
        let r = default_rect(OverlayMode::Corner, small, 1.0);
        assert_eq!((r.width, r.height), (420, 220));
    }

    #[test]
    fn strip_is_top_center_flush() {
        let r = default_rect(OverlayMode::Strip, WORK, 1.0);
        assert_eq!(
            r,
            Rect {
                x: 384,
                y: 0,
                width: 1152,
                height: 187
            }
        );
    }

    #[test]
    fn full_is_work_area_and_offset_monitors_work() {
        let second = Rect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
        };
        assert_eq!(default_rect(OverlayMode::Full, second, 1.0), second);
        assert!(default_rect(OverlayMode::Corner, second, 1.0).x < 0);
        assert!(!intersects(second, WORK));
        assert!(intersects(
            Rect {
                x: 100,
                y: 100,
                width: 10,
                height: 10
            },
            WORK
        ));
    }
}
