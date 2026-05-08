frappe.views.calendar["Meeting Room Appointment"] = {

    field_map: {

        start: "appointment_datetime",

        end: "end_time",

        id: "name",

        title: "meeting_room",

        allDay: "allDay",

        eventColor: "color"
    },

    order_by: "appointment_datetime",

    gantt: true,

    get_events_method:
        "meeting_room_booking.meeting_room.doctype.meeting_room_appointment.meeting_room_appointment.get_events"
};