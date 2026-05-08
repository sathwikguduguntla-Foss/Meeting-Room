let selected_slots = [];


frappe.ui.form.on(
    "Meeting Room Appointment",
{

    refresh(frm) {

        frm.clear_custom_buttons();

        frm.add_custom_button(

            "Get Available Slots",

            () => {

                if (
                    !frm.doc.meeting_room
                    || !frm.doc.appointment_datetime
                ) {

                    frappe.msgprint(
                        "Please Select Meeting Room and Date"
                    );

                    return;
                }

                load_slots(frm);
            }
        );
    },

    meeting_room(frm) {

        fetch_schedule(frm);
    }
});



function fetch_schedule(frm) {

    if (!frm.doc.meeting_room)
        return;

    frappe.db.get_value(

        "Meeting Room",

        frm.doc.meeting_room,

        "schedule",

        (r) => {

            if (r && r.schedule) {

                frm.set_value(
                    "schedule",
                    r.schedule
                );
            }
        }
    );
}



function load_slots(frm) {

    let date =
        frm.doc.appointment_datetime
            .split(" ")[0];

    frappe.call({

        method:
        "meeting_room_booking.meeting_room.doctype.meeting_room_appointment.meeting_room_appointment.get_available_slots",

        args: {

            meeting_room:
                frm.doc.meeting_room,

            appointment_date:
                date
        },

        freeze: true,

        freeze_message:
            "Loading Slots...",

        callback(r) {

            render_slot_dialog(

                frm,

                r.message || []
            );
        }
    });
}



function render_slot_dialog(
    frm,
    slots
) {

    selected_slots = [];

    let html = `
        <div
            style="
                display:flex;
                flex-wrap:wrap;
                gap:10px;
            "
        >
    `;

    slots.forEach(slot => {

        let disabled =
            slot.disabled
            ? "disabled"
            : "";

        let btn_class =
            slot.disabled
            ? "btn-secondary"
            : "btn-outline-primary";

        html += `
            <button

                class="
                    btn
                    ${btn_class}
                    slot-btn
                "

                data-slot="${slot.time}"

                ${disabled}

                style="
                    min-width:110px;
                    border-radius:10px;
                "
            >
                ${format_time(slot.time)}
            </button>
        `;
    });

    html += `</div>`;


    let d = new frappe.ui.Dialog({

        title:
            "Available Slots",

        size:
            "large",

        fields: [

            {
                fieldtype:
                    "HTML",

                fieldname:
                    "slots_html"
            }
        ],

        primary_action_label:
            "Book Selected Slots",

        primary_action() {

            if (
                selected_slots.length === 0
            ) {

                frappe.msgprint(
                    "Please Select At Least One Slot"
                );

                return;
            }

            let date =
                frm.doc.appointment_datetime
                    .split(" ")[0];

            frappe.call({

                method:
                "meeting_room_booking.meeting_room.doctype.meeting_room_appointment.meeting_room_appointment.book_multiple_slots",

                args: {

                    meeting_room:
                        frm.doc.meeting_room,

                    appointment_date:
                        date,

                    slots:
                        selected_slots,

                    duration_in_minutes:
                        parseInt(
                            frm.doc.duration_in_minutes || 60
                        )
                },

                freeze: true,

                freeze_message:
                    "Booking Slots...",

                callback(r) {

                    frappe.show_alert({

                        message:
                            "Slots Booked Successfully",

                        indicator:
                            "green"
                    });

                    d.hide();

                    frm.reload_doc();
                }
            });
        }
    });


    d.fields_dict.slots_html
        .$wrapper
        .html(html);

    d.show();


    d.get_primary_btn()
        .attr("disabled", true);


    d.$wrapper.on(

        "click",

        ".slot-btn:not(:disabled)",

        function() {

            let slot =
                $(this).attr(
                    "data-slot"
                );

            if (
                selected_slots.includes(slot)
            ) {

                selected_slots =
                    selected_slots.filter(
                        s => s !== slot
                    );

                $(this)

                    .removeClass(
                        "btn-primary"
                    )

                    .addClass(
                        "btn-outline-primary"
                    );

            } else {

                selected_slots.push(slot);

                $(this)

                    .removeClass(
                        "btn-outline-primary"
                    )

                    .addClass(
                        "btn-primary"
                    );
            }

            d.get_primary_btn()
                .attr(

                    "disabled",

                    selected_slots.length === 0
                );
        }
    );
}



function format_time(time_str) {

    let parts =
        time_str.split(":");

    let hour =
        parseInt(parts[0]);

    let minute =
        parts[1];

    let ampm =
        hour >= 12
        ? "PM"
        : "AM";

    hour =
        hour % 12;

    hour =
        hour
        ? hour
        : 12;

    return `${hour}:${minute} ${ampm}`;
}