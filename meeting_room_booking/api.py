import frappe


@frappe.whitelist(allow_guest=True)
def get_meeting_rooms():

    rooms = frappe.get_all(

        "Meeting Room",

        fields=[
            "name"
        ],

        order_by="name asc"
    )

    return rooms