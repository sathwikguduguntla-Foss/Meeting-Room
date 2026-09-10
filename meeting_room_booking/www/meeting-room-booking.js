/* ================================================================
   STATE
   ================================================================ */

let selected_slots = [];

let login_timeout = null;
let login_countdown = null;
let login_expires_at = null;

const LOGIN_TIMEOUT = 2 * 60 * 1000;


/* ================================================================
   INIT
   ================================================================ */

frappe.ready(() => {
    checkAuthentication();
});


/* ================================================================
   PASSWORD SHOW / HIDE
   ================================================================ */

function togglePassword() {

    const password =
        document.getElementById("mrb-login-password");

    const button =
        document.getElementById("mrb-password-toggle");

    if (!password || !button) {
        return;
    }

    if (password.type === "password") {
        password.type = "text";
        button.textContent = "Hide";
    } else {
        password.type = "password";
        button.textContent = "Show";
    }
}


/* ================================================================
   AUTHENTICATION
   ================================================================ */

function checkAuthentication() {

    const user =
        frappe.session && frappe.session.user
            ? frappe.session.user
            : "Guest";

    if (!user || user === "Guest") {
        showLoginPage();
        return;
    }

    showBookingPage(user);
}


function showLoginPage() {

    clearTimeout(login_timeout);
    clearInterval(login_countdown);

    login_timeout = null;
    login_countdown = null;
    login_expires_at = null;

    const loginSection =
        document.getElementById("mrb-login-section");

    const bookingWrapper =
        document.getElementById("mrb-booking-wrapper");

    const timerBox =
        document.getElementById("mrb-session-timer");

    if (loginSection) {
        loginSection.style.display = "flex";
    }

    if (bookingWrapper) {
        bookingWrapper.style.display = "none";
    }

    if (timerBox) {
        timerBox.style.display = "none";
    }

    const password =
        document.getElementById("mrb-login-password");

    if (password) {
        password.value = "";
        password.type = "password";
    }

    const passwordToggle =
        document.getElementById("mrb-password-toggle");

    if (passwordToggle) {
        passwordToggle.textContent = "Show";
    }

    const loginButton =
        document.getElementById("mrb-login-btn");

    if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = "Login";
    }

    const errorBox =
        document.getElementById("mrb-login-error");

    if (errorBox) {
        errorBox.style.display = "none";
        errorBox.textContent = "";
    }

    setTimeout(() => {

        const username =
            document.getElementById("mrb-login-username");

        if (username) {
            username.focus();
        }

    }, 100);
}


function showBookingPage(user) {

    const loginSection =
        document.getElementById("mrb-login-section");

    const bookingWrapper =
        document.getElementById("mrb-booking-wrapper");

    if (loginSection) {
        loginSection.style.display = "none";
    }

    if (bookingWrapper) {
        bookingWrapper.style.display = "block";
    }

    const userBox =
        document.getElementById("mrb-login-user");

    if (userBox) {
        userBox.textContent =
            `Logged in as: ${user}`;

        userBox.style.display = "block";
    }

    const dateField =
        document.getElementById("appointment_date");

    if (dateField && !dateField.value) {
        dateField.value =
            new Date().toISOString().split("T")[0];
    }

    startLoginTimer();
    loadMeetingRooms();
}


/* ================================================================
   TWO-MINUTE SESSION COUNTDOWN
   ================================================================ */

function startLoginTimer() {

    clearTimeout(login_timeout);
    clearInterval(login_countdown);

    const timerBox =
        document.getElementById("mrb-session-timer");

    const timerText =
        document.getElementById("mrb-session-time");

    login_expires_at =
        Date.now() + LOGIN_TIMEOUT;

    if (timerBox) {
        timerBox.style.display = "inline-flex";
    }

    function updateLoginCountdown() {

        const remaining =
            Math.max(
                0,
                login_expires_at - Date.now()
            );

        const totalSeconds =
            Math.ceil(remaining / 1000);

        const minutes =
            Math.floor(totalSeconds / 60);

        const seconds =
            totalSeconds % 60;

        if (timerText) {

            timerText.textContent =
                String(minutes).padStart(2, "0")
                + ":"
                + String(seconds).padStart(2, "0");
        }

        if (remaining <= 0) {

            clearInterval(login_countdown);
            login_countdown = null;
        }
    }

    updateLoginCountdown();

    login_countdown =
        setInterval(
            updateLoginCountdown,
            250
        );

    login_timeout =
        setTimeout(() => {

            clearInterval(login_countdown);
            login_countdown = null;

            automaticLogout();

        }, LOGIN_TIMEOUT);
}


/* ================================================================
   AUTOMATIC LOGOUT
   ================================================================ */

function automaticLogout() {

    clearTimeout(login_timeout);
    clearInterval(login_countdown);

    login_timeout = null;
    login_countdown = null;

    selected_slots = [];

    fetch("/api/method/logout", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    })
    .then(() => {
        showLoginPage();
    })
    .catch(error => {

        console.error(
            "Automatic logout failed:",
            error
        );

        showLoginPage();
    });
}


/* ================================================================
   LOGIN
   ================================================================ */

function loginUser(event) {

    event.preventDefault();

    const username =
        document
            .getElementById("mrb-login-username")
            .value
            .trim();

    const password =
        document
            .getElementById("mrb-login-password")
            .value;

    const loginButton =
        document.getElementById("mrb-login-btn");

    if (!username || !password) {

        showLoginError(
            "Please enter your username and password."
        );

        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    fetch("/api/method/login", {
        method: "POST",

        headers: {
            "Content-Type":
                "application/x-www-form-urlencoded; charset=UTF-8",

            "X-Frappe-CSRF-Token":
                frappe.csrf_token || ""
        },

        body: new URLSearchParams({
            usr: username,
            pwd: password
        }),

        credentials: "same-origin",
        cache: "no-store"
    })

    .then(async response => {

        let data = {};

        try {
            data = await response.json();
        } catch (e) {
            throw new Error(
                "Invalid response from server."
            );
        }

        if (!response.ok || data.exc) {

            let message =
                "Invalid username or password.";

            if (data.message) {

                if (typeof data.message === "string") {
                    message = data.message;
                }

                else if (data.message.message) {
                    message = data.message.message;
                }
            }

            throw new Error(message);
        }

        return data;
    })

    .then(() => {

        window.location.reload();

    })

    .catch(error => {

        console.error(
            "Login error:",
            error
        );

        loginButton.disabled = false;
        loginButton.textContent = "Login";

        showLoginError(
            error.message ||
            "Invalid username or password."
        );
    });
}


function showLoginError(message) {

    const errorBox =
        document.getElementById("mrb-login-error");

    if (!errorBox) {
        return;
    }

    errorBox.textContent = message;
    errorBox.style.display = "block";
}


/* ================================================================
   MANUAL LOGOUT
   ================================================================ */

function logoutUser() {

    clearTimeout(login_timeout);
    clearInterval(login_countdown);

    login_timeout = null;
    login_countdown = null;

    selected_slots = [];

    const button =
        document.querySelector(".mrb-logout-btn");

    if (button) {
        button.disabled = true;
        button.textContent = "Logging out...";
    }

    fetch("/api/method/logout", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    })

    .then(() => {
        showLoginPage();
    })

    .catch(error => {

        console.error(
            "Logout error:",
            error
        );

        showLoginPage();
    });
}


/* ================================================================
   LOAD MEETING ROOMS
   ================================================================ */

function loadMeetingRooms() {

    const select =
        document.getElementById("meeting_room");

    const errorBox =
        document.getElementById("form-errors");

    if (!select) {
        return;
    }

    select.disabled = true;
    select.innerHTML =
        '<option value="">Loading...</option>';

    if (errorBox) {
        errorBox.innerHTML = "";
    }

    frappe.call({

        method:
            "meeting_room_booking.api.get_meeting_rooms",

        callback: function(response) {

            const rooms =
                response.message || [];

            select.innerHTML =
                '<option value="">Select a room</option>';

            if (!rooms.length) {

                select.innerHTML =
                    '<option value="">No meeting rooms found</option>';

                if (errorBox) {

                    errorBox.innerHTML = `
                        <div class="mrb-alert mrb-alert-warning">
                            No Meeting Room records were found.
                        </div>`;
                }

                return;
            }

            rooms.forEach(room => {

                const option =
                    document.createElement("option");

                option.value = room.name;
                option.textContent = room.name;

                select.appendChild(option);
            });

            select.disabled = false;
        },

        error: function(error) {

            console.error(
                "Meeting Room API error:",
                error
            );

            select.innerHTML =
                '<option value="">Unable to load rooms</option>';

            if (errorBox) {

                errorBox.innerHTML = `
                    <div class="mrb-alert mrb-alert-danger">
                        Unable to load Meeting Rooms.
                        Please check the API path and server permissions.
                    </div>`;
            }
        }
    });
}


/* ================================================================
   LOAD AVAILABLE SLOTS
   ================================================================ */

function loadSlots() {

    selected_slots = [];

    const booking_name =
        document
            .getElementById("booking_name")
            .value
            .trim();

    const meeting_room =
        document.getElementById("meeting_room").value;

    const appointment_date =
        document.getElementById("appointment_date").value;

    const duration = 60;

    const errors = [];

    if (!booking_name) {
        errors.push("Booking Name is required.");
    }

    if (!meeting_room) {
        errors.push("Please select a Meeting Room.");
    }

    if (!appointment_date) {
        errors.push("Please select a Date.");
    }

    document.getElementById("form-errors").innerHTML = "";

    if (errors.length) {
        showFormErrors(errors);
        return;
    }

    const section =
        document.getElementById("slots-section");

    section.style.display = "block";

    section.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });

    document.getElementById("slot-grid").innerHTML = `
        <div style="grid-column:1/-1;">
            <div class="mrb-state">
                <div class="mrb-spinner"></div>
                <p>Loading available slots...</p>
            </div>
        </div>`;

    document.getElementById("book-bar")
        .style.display = "none";

    document.getElementById("slot-errors")
        .innerHTML = "";

    document.getElementById("slots-meta-text")
        .textContent = "";

    frappe.call({

        method:
            "meeting_room_booking.meeting_room.doctype.meeting_room_appointment.meeting_room_appointment.get_available_slots",

        args: {
            meeting_room: meeting_room,
            appointment_date: appointment_date
        },

        callback: function(response) {

            renderSlots(
                response.message || [],
                duration,
                appointment_date
            );
        },

        error: function(error) {

            console.error(
                "Failed to load available slots:",
                error
            );

            document.getElementById("slot-grid").innerHTML = `
                <div style="grid-column:1/-1;">
                    <div class="mrb-alert mrb-alert-danger">
                        Unable to load available slots.
                        Please login again and try.
                    </div>
                </div>`;
        }
    });
}


/* ================================================================
   RENDER SLOTS
   ================================================================ */

function renderSlots(
    slots,
    duration,
    appointment_date
) {

    const grid =
        document.getElementById("slot-grid");

    const metaText =
        document.getElementById("slots-meta-text");

    if (!slots.length) {

        grid.innerHTML = `
            <div style="grid-column:1/-1;">
                <div class="mrb-state">

                    <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <rect
                            x="3"
                            y="4"
                            width="18"
                            height="18"
                            rx="2"
                        />
                        <line
                            x1="3"
                            y1="10"
                            x2="21"
                            y2="10"
                        />
                        <line
                            x1="8"
                            y1="2"
                            x2="8"
                            y2="6"
                        />
                        <line
                            x1="16"
                            y1="2"
                            x2="16"
                            y2="6"
                        />
                    </svg>

                    <p>
                        No slots available for the selected
                        date and room.
                    </p>

                </div>
            </div>`;

        metaText.innerHTML = "";

        return;
    }

    const available =
        slots.filter(
            slot => !slot.disabled
        ).length;

    const booked =
        slots.filter(
            slot => slot.disabled
        ).length;

    metaText.innerHTML =
        `<strong>${appointment_date}</strong>
         &nbsp;·&nbsp;
         ${slots.length} total slots
         &nbsp;·&nbsp;
         <span style="color:var(--success)">
             ${available} available
         </span>` +
        (
            booked
                ? ` &nbsp;·&nbsp;
                   <span style="color:#9aa3ab">
                       ${booked} booked
                   </span>`
                : ""
        );

    grid.innerHTML = "";

    slots.forEach(slot => {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "slot-btn " +
            (
                slot.disabled
                    ? "booked"
                    : "available"
            );

        button.dataset.slot =
            slot.from_time;

        button.innerHTML = `
            <span class="slot-time">
                ${formatTime(slot.from_time)}
            </span>

            <span class="slot-status">
                ${
                    slot.disabled
                        ? "Booked"
                        : "Available"
                }
            </span>`;

        if (!slot.disabled) {

            button.addEventListener(
                "click",
                () => toggleSlot(
                    button,
                    slot.from_time,
                    duration
                )
            );
        }

        grid.appendChild(button);
    });

    grid.classList.remove("flash-in");

    void grid.offsetWidth;

    grid.classList.add("flash-in");
}


/* ================================================================
   SELECT / UNSELECT SLOT
   ================================================================ */

function toggleSlot(
    button,
    slot_time,
    duration
) {

    if (selected_slots.includes(slot_time)) {

        selected_slots =
            selected_slots.filter(
                slot => slot !== slot_time
            );

        button.classList.remove("selected");

        button.querySelector(
            ".slot-status"
        ).textContent = "Available";

    } else {

        selected_slots.push(slot_time);

        button.classList.add("selected");

        button.querySelector(
            ".slot-status"
        ).textContent = "Selected";
    }

    updateBookBar(duration);
}


/* ================================================================
   BOOK BAR
   ================================================================ */

function updateBookBar(duration) {

    const bar =
        document.getElementById("book-bar");

    if (!selected_slots.length) {

        bar.style.display = "none";
        return;
    }

    bar.style.display = "flex";

    document.getElementById(
        "selected-count"
    ).textContent =
        selected_slots.length;
}


/* ================================================================
   BOOK SELECTED SLOTS
   ================================================================ */

function bookSlots() {

    if (!selected_slots.length) {

        frappe.msgprint(
            "Please select at least one slot."
        );

        return;
    }

    const meeting_room =
        document.getElementById("meeting_room").value;

    const appointment_date =
        document.getElementById("appointment_date").value;

    const duration_in_minutes = 60;

    const booking_name =
        document
            .getElementById("booking_name")
            .value
            .trim();

    const bookButton =
        document.getElementById("book-btn");

    bookButton.disabled = true;
    bookButton.textContent = "Booking...";

    frappe.call({

        method:
            "meeting_room_booking.meeting_room.doctype.meeting_room_appointment.meeting_room_appointment.book_multiple_slots",

        args: {

            meeting_room:
                meeting_room,

            appointment_date:
                appointment_date,

            slots:
                selected_slots,

            duration_in_minutes:
                duration_in_minutes,

            booking_name:
                booking_name
        },

        callback: function(response) {

            const result =
                response.message || {};

            const errors =
                result.errors || [];

            document.getElementById(
                "slot-errors"
            ).innerHTML = "";

            if (errors.length) {

                document.getElementById(
                    "slot-errors"
                ).innerHTML = `

                    <div class="mrb-alert mrb-alert-warning">

                        <div>

                            <strong>
                                Some slots could not be booked:
                            </strong>

                            <ul>
                                ${
                                    errors
                                        .map(
                                            error =>
                                                `<li>${error}</li>`
                                        )
                                        .join("")
                                }
                            </ul>

                        </div>

                    </div>`;
            }

            if (
                result.booked &&
                result.booked.length
            ) {

                frappe.show_alert(
                    {
                        message:
                            `${result.booked.length} slot(s) booked successfully!`,
                        indicator: "green"
                    },
                    5
                );
            }

            bookButton.disabled = false;

            bookButton.innerHTML = `

                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <polyline points="20 6 9 17 4 12"/>
                </svg>

                Confirm Booking`;

            selected_slots = [];

            loadSlots();
        },

        error: function(error) {

            console.error(
                "Booking error:",
                error
            );

            bookButton.disabled = false;

            bookButton.innerHTML = `
                Confirm Booking`;

            document.getElementById(
                "slot-errors"
            ).innerHTML = `

                <div class="mrb-alert mrb-alert-danger">
                    Unable to complete the booking.
                    Please login again and try.
                </div>`;
        }
    });
}


/* ================================================================
   RESET
   ================================================================ */

function resetForm() {

    document.getElementById(
        "booking_name"
    ).value = "";

    document.getElementById(
        "meeting_room"
    ).value = "";

    document.getElementById(
        "appointment_date"
    ).value =
        new Date()
            .toISOString()
            .split("T")[0];

    document.getElementById(
        "slots-section"
    ).style.display = "none";

    document.getElementById(
        "slot-grid"
    ).innerHTML = "";

    document.getElementById(
        "book-bar"
    ).style.display = "none";

    document.getElementById(
        "slot-errors"
    ).innerHTML = "";

    document.getElementById(
        "slots-meta-text"
    ).textContent = "";

    document.getElementById(
        "form-errors"
    ).innerHTML = "";

    selected_slots = [];
}


/* ================================================================
   FORM ERRORS
   ================================================================ */

function showFormErrors(errors) {

    document.getElementById(
        "form-errors"
    ).innerHTML = `

        <div class="mrb-alert mrb-alert-danger">

            <div>

                <strong>
                    Please fix the following:
                </strong>

                <ul>
                    ${
                        errors
                            .map(
                                error =>
                                    `<li>${error}</li>`
                            )
                            .join("")
                    }
                </ul>

            </div>

        </div>`;
}


/* ================================================================
   FORMAT TIME
   ================================================================ */

function formatTime(timeString) {

    if (!timeString) {
        return "";
    }

    const parts =
        timeString.split(":");

    let hour =
        parseInt(parts[0]);

    const minute =
        parts[1];

    const ampm =
        hour >= 12
            ? "PM"
            : "AM";

    hour =
        hour % 12 || 12;

    return `${hour}:${minute} ${ampm}`;
}