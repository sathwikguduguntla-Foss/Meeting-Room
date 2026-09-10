import frappe

from frappe import _


@frappe.whitelist()
def get_meeting_rooms():

    # =========================================
    # LOGIN REQUIRED
    # =========================================

    if frappe.session.user == "Guest":
        frappe.throw(
            _("Please login to view meeting rooms.")
        )

    # =========================================
    # GET MEETING ROOMS
    # =========================================

    rooms = frappe.get_all(
        "Meeting Room",
        fields=["name"],
        order_by="name asc",
        limit_page_length=100
    )

    return rooms