import { type CalendarRaid, calendarWeeks } from "@garrison/db";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Five weeks of raids from this week on, in the server's time zone. Weekly raids
 * show their later weeks dimmed (they post after the current one runs). On a
 * phone it becomes a list of the days that have something on.
 */
export function OpsCalendar({
  raids,
  timeZone,
  now = new Date(),
}: {
  raids: CalendarRaid[];
  timeZone: string;
  now?: Date;
}) {
  const weeks = calendarWeeks(raids, timeZone, now);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const busy = weeks.flat().some((d) => d.items.length);
  return (
    <div className="ops-cal">
      <table className="ops-cal__grid" aria-label="Raids by day">
        <thead>
          <tr className="ops-cal__row ops-cal__row--head">
            {WEEKDAYS.map((d) => (
              <th key={d} className="ops-cal__weekday" scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.key} className="ops-cal__row">
              {week.map((d) => (
                <td
                  key={d.key}
                  className={`ops-cal__day${d.today ? " is-today" : ""}${d.past ? " is-past" : ""}${
                    d.items.length ? "" : " is-empty"
                  }`}
                  aria-current={d.today ? "date" : undefined}
                >
                  <span className="ops-cal__date">
                    <span className="ops-cal__date-short">
                      {d.day === 1 || d === weeks[0]?.[0]
                        ? `${MONTHS[d.month - 1]} ${d.day}`
                        : d.day}
                    </span>
                    <span className="ops-cal__date-long">
                      {WEEKDAYS[week.indexOf(d)]}, {MONTHS[d.month - 1]} {d.day}
                    </span>
                  </span>
                  {d.items.map((i) => (
                    <span
                      key={i.id}
                      className={`ops-cal__item${i.projected ? " is-projected" : ""}`}
                      title={
                        i.projected ? "Repeats weekly; posts after the week before runs" : undefined
                      }
                    >
                      <span className="ops-cal__time">{time.format(i.startsAt)}</span>{" "}
                      <span className="ops-cal__title">{i.title}</span>
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {busy ? null : (
        <p className="queue__empty muted">Nothing scheduled in the next five weeks.</p>
      )}
    </div>
  );
}
