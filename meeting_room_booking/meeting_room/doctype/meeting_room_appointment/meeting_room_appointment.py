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
    # Checks exact datetime match only
    # =========================================
    def validate_overlaps(self):

        if not self.meeting_room or not self.appointment_datetime:
            return

        overlapping = frappe.db.exists(
            "Meeting Room Appointment",
            {
                "meeting_room": self.meeting_room,
                "appointment_datetime": self.appointment_datetime,
                "docstatus": ["!=", 2],
                "name": ["!=", self.name]
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

            event_subject = (
                self.name1
                or f"{self.meeting_room} Booking"
            )

            existing_event = frappe.db.exists(
                "Event",
                {
                    "subject": event_subject,
                    "starts_on": self.appointment_datetime
                }
            )

            if existing_event:
                return

            event = frappe.get_doc({
                "doctype": "Event",
                "subject": event_subject,
                "starts_on": self.appointment_datetime,
                "ends_on": self.appointment_datetime,
                "event_type": "Public",
                "event_category": "Meeting",
                "status": "Open",
                "all_day": 0,
                "color": "#4285F4",
                "description": (
                    f"Meeting Room: {self.meeting_room}\n"
                    f"User: {self.user}"
                )
            })

            event.insert(
                ignore_permissions=True
            )

            frappe.db.commit()

        except Exception:

            frappe.log_error(
                frappe.get_traceback(),
                "Meeting Room Event Creation Failed"
            )


# =========================================
# GET AVAILABLE SLOTS
# Param:
# appointment_date = YYYY-MM-DD
# =========================================
@frappe.whitelist()
def get_available_slots(
    meeting_room,
    appointment_date,
    name=None
):

    # =========================================
    # LOGIN REQUIRED
    # =========================================
    if frappe.session.user == "Guest":
        frappe.throw(
            _("Please login to view available meeting room slots.")
        )

    if not meeting_room or not appointment_date:
        return []

    appointment_date = getdate(
        appointment_date
    )

    weekday = appointment_date.strftime(
        "%A"
    )

    # =========================================
    # GET SCHEDULE LINKED TO ROOM
    # =========================================
    schedule = frappe.db.get_value(
        "Meeting Room",
        meeting_room,
        "schedule"
    )

    if not schedule:
        return []

    # =========================================
    # GET TIME SLOTS FOR WEEKDAY
    # =========================================
    slots = frappe.db.sql(
        """
        SELECT
            slot.from_time,
            slot.to_time,
            slot.day
        FROM
            `tabSchedule Time Slot` slot
        WHERE
            slot.parent = %(schedule)s
            AND slot.day = %(weekday)s
        ORDER BY
            slot.from_time
        """,
        {
            "schedule": schedule,
            "weekday": weekday
        },
        as_dict=True,
    )

    # =========================================
    # GET BOOKED SLOTS
    # =========================================
    booked_rows = frappe.db.sql(
        """
        SELECT
            appointment_datetime
        FROM
            `tabMeeting Room Appointment`
        WHERE
            meeting_room = %(meeting_room)s
            AND DATE(appointment_datetime) = %(date)s
            AND docstatus != 2
        """,
        {
            "meeting_room": meeting_room,
            "date": appointment_date
        },
        as_dict=True,
    )

    booked_datetimes = {
        get_datetime(
            row["appointment_datetime"]
        )
        for row in booked_rows
    }

    available_slots = []

    # =========================================
    # BUILD AVAILABLE SLOT LIST
    # =========================================
    for slot in slots:

        from_time = slot["from_time"]

        # -----------------------------------------
        # timedelta -> time
        # -----------------------------------------
        if isinstance(
            from_time,
            datetime.timedelta
        ):
            from_time = (
                datetime.datetime.min
                + from_time
            ).time()

        # -----------------------------------------
        # string -> time
        # -----------------------------------------
        if isinstance(
            from_time,
            str
        ):

            try:

                from_time = datetime.datetime.strptime(
                    from_time,
                    "%H:%M:%S"
                ).time()

            except ValueError:

                from_time = datetime.datetime.strptime(
                    from_time,
                    "%H:%M"
                ).time()

        # -----------------------------------------
        # Combine date + time
        # -----------------------------------------
        slot_datetime = datetime.datetime.combine(
            appointment_date,
            from_time
        )

        is_booked = (
            slot_datetime in booked_datetimes
        )

        available_slots.append({
            "from_time": str(from_time),
            "disabled": is_booked
        })

    return available_slots


# =========================================
# BOOK MULTIPLE SLOTS
# =========================================
@frappe.whitelist()
def book_multiple_slots(
    meeting_room,
    appointment_date,
    slots,
    duration_in_minutes=60,
    booking_name=None
):

    import json

    # =========================================
    # LOGIN REQUIRED
    # =========================================
    if frappe.session.user == "Guest":
        frappe.throw(
            _("Please login before booking a meeting room.")
        )

    # =========================================
    # CONVERT JSON STRING TO LIST
    # =========================================
    if isinstance(slots, str):

        slots = json.loads(slots)

    if not slots:
        frappe.throw(
            _("Please select at least one slot.")
        )

    # =========================================
    # DATE
    # =========================================
    appointment_date = getdate(
        appointment_date
    )

    errors = []
    booked = []

    # =========================================
    # BOOK EACH SELECTED SLOT
    # =========================================
    for slot_time in slots:

        # -----------------------------------------
        # Parse HH:MM:SS
        # -----------------------------------------
        try:

            t = datetime.datetime.strptime(
                slot_time,
                "%H:%M:%S"
            ).time()

        except ValueError:

            # -------------------------------------
            # Parse HH:MM
            # -------------------------------------
            try:

                t = datetime.datetime.strptime(
                    slot_time,
                    "%H:%M"
                ).time()

            except ValueError:

                errors.append(
                    f"Invalid slot time {slot_time}."
                )

                continue

        # =========================================
        # COMBINE DATE + TIME
        # =========================================
        slot_datetime = datetime.datetime.combine(
            appointment_date,
            t
        )

        try:

            # =====================================
            # CREATE APPOINTMENT
            # =====================================
            doc = frappe.get_doc({
                "doctype": "Meeting Room Appointment",
                "name1": booking_name or "",
                "meeting_room": meeting_room,
                "appointment_datetime": slot_datetime,
                "duration_in_minutes": int(
                    duration_in_minutes
                ),
                "user": frappe.session.user
            })

            # =====================================
            # INSERT
            # =====================================
            doc.insert(
                ignore_permissions=True
            )

            # =====================================
            # SUBMIT
            # =====================================
            doc.submit()

            # =====================================
            # COMMIT
            # =====================================
            frappe.db.commit()

            booked.append(
                str(slot_datetime)
            )

        except OverlapError:

            frappe.db.rollback()

            errors.append(
                f"Slot {slot_time} is already booked."
            )

        except Exception:

            frappe.db.rollback()

            frappe.log_error(
                frappe.get_traceback(),
                "Meeting Room Slot Booking Failed"
            )

            errors.append(
                f"Could not book slot {slot_time}."
            )

    # =========================================
    # RETURN RESULT
    # =========================================
    return {
        "booked": booked,
        "errors": errors
    }