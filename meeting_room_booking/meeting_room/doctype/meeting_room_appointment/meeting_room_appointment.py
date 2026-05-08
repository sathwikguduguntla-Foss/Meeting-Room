import datetime
import frappe

from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, getdate


class OverlapError(frappe.ValidationError):
    pass


class MeetingRoomAppointment(Document):

    # =========================================
    # VALIDATE
    # =========================================
    def validate(self):
        self.validate_overlaps()

    # =========================================
    # VALIDATE OVERLAPS
    # Checks exact datetime match only — no range
    # =========================================
    def validate_overlaps(self):

        if not self.meeting_room or not self.appointment_datetime:
            return

        overlapping = frappe.db.exists(
            "Meeting Room Appointment",
            {
                "meeting_room":        self.meeting_room,
                "appointment_datetime": self.appointment_datetime,
                "docstatus":           ["!=", 2],
                "name":                ["!=", self.name]
            }
        )

        if overlapping:
            frappe.throw(
                _(
                    "Meeting Room {0} is already booked at {1}"
                ).format(
                    frappe.bold(self.meeting_room),
                    frappe.bold(self.appointment_datetime),
                ),
                OverlapError,
            )

    # =========================================
    # AFTER INSERT
    # =========================================
    def after_insert(self):
        self.create_calendar_event()

    # =========================================
    # CREATE CALENDAR EVENT
    # =========================================
    def create_calendar_event(self):

        try:
            existing_event = frappe.db.exists(
                "Event",
                {
                    "subject":   f"{self.meeting_room} Booking",
                    "starts_on": self.appointment_datetime
                }
            )

            if existing_event:
                return

            event = frappe.get_doc({
                "doctype":        "Event",
                "subject":        self.name1 or f"{self.meeting_room} Booking",
                "starts_on":      self.appointment_datetime,
                "ends_on":        self.appointment_datetime,
                "event_type":     "Public",
                "event_category": "Meeting",
                "status":         "Open",
                "all_day":        0,
                "color":          "#4285F4",
                "description":    f"Meeting Room: {self.meeting_room}\nUser: {self.user}"
            })

            event.insert(ignore_permissions=True)
            frappe.db.commit()

        except Exception:
            frappe.log_error(
                frappe.get_traceback(),
                "Meeting Room Event Creation Failed"
            )


# =========================================
# GET AVAILABLE SLOTS
# Param: appointment_date (YYYY-MM-DD string)
# =========================================
@frappe.whitelist(allow_guest=True)
def get_available_slots(
    meeting_room,
    appointment_date,
    name=None
):

    if not meeting_room or not appointment_date:
        return []

    appointment_date = getdate(appointment_date)
    weekday = appointment_date.strftime("%A")

    # get schedule linked to the room
    schedule = frappe.db.get_value(
        "Meeting Room",
        meeting_room,
        "schedule"
    )

    if not schedule:
        return []

    # fetch time slots for the weekday
    slots = frappe.db.sql(
        """
        SELECT
            slot.from_time,
            slot.to_time,
            slot.day
        FROM
            `tabSchedule Time Slot` slot
        WHERE
            slot.parent  = %(schedule)s
            AND slot.day = %(weekday)s
        ORDER BY slot.from_time
        """,
        {"schedule": schedule, "weekday": weekday},
        as_dict=True,
    )

    # fetch already booked datetimes for this room+date
    booked_rows = frappe.db.sql(
        """
        SELECT appointment_datetime
        FROM   `tabMeeting Room Appointment`
        WHERE  meeting_room               = %(meeting_room)s
          AND  DATE(appointment_datetime) = %(date)s
          AND  docstatus                 != 2
        """,
        {"meeting_room": meeting_room, "date": appointment_date},
        as_dict=True,
    )

    booked_datetimes = {
        get_datetime(b["appointment_datetime"])
        for b in booked_rows
    }

    available_slots = []

    for slot in slots:

        from_time = slot["from_time"]

        # normalise timedelta → time
        if isinstance(from_time, datetime.timedelta):
            from_time = (datetime.datetime.min + from_time).time()

        # normalise string → time
        if isinstance(from_time, str):
            from_time = datetime.datetime.strptime(from_time, "%H:%M:%S").time()

        slot_datetime = datetime.datetime.combine(appointment_date, from_time)
        is_booked     = slot_datetime in booked_datetimes

        available_slots.append({
            "from_time": str(from_time),   # "HH:MM:SS"
            "disabled":  is_booked
        })

    return available_slots


# =========================================
# BOOK MULTIPLE SLOTS
# Accepts booking_name for the name1 field.
# Catches OverlapError per-slot so one
# duplicate never blocks the whole batch.
# =========================================
@frappe.whitelist(allow_guest=True)
def book_multiple_slots(
    meeting_room,
    appointment_date,
    slots,
    duration_in_minutes=60,
    booking_name=None
):

    import json

    if isinstance(slots, str):
        slots = json.loads(slots)

    appointment_date = getdate(appointment_date)

    errors = []
    booked = []

    for slot_time in slots:

        # parse HH:MM:SS or HH:MM
        try:
            t = datetime.datetime.strptime(slot_time, "%H:%M:%S").time()
        except ValueError:
            t = datetime.datetime.strptime(slot_time, "%H:%M").time()

        slot_datetime = datetime.datetime.combine(appointment_date, t)

        try:
            doc = frappe.get_doc({
                "doctype":              "Meeting Room Appointment",
                "name1":               booking_name or "",
                "meeting_room":         meeting_room,
                "appointment_datetime": slot_datetime,
                "duration_in_minutes":  int(duration_in_minutes),
                "user":                 frappe.session.user
            })

            doc.insert(ignore_permissions=True)
            doc.submit()
            frappe.db.commit()
            booked.append(str(slot_datetime))

        except OverlapError:
            frappe.db.rollback()
            errors.append(f"Slot {slot_time} is already booked.")

        except Exception:
            frappe.db.rollback()
            frappe.log_error(
                frappe.get_traceback(),
                "Meeting Room Slot Booking Failed"
            )
            errors.append(f"Could not book slot {slot_time}.")

    return {"booked": booked, "errors": errors}

