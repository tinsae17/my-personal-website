const contactForm = document.getElementById("contactForm");
const formMessage = document.getElementById("formMessage");

contactForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const message = document.getElementById("userMessage").value;

    try {

        const response = await fetch("/api/contact", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name: name,
                email: email,
                message: message
            })
        });

        const data = await response.json();

        formMessage.textContent = data.message;

        if (data.success) {
            contactForm.reset();
        }

    } catch (error) {

        console.error(error);

        formMessage.textContent =
            "Something went wrong. Please try again.";

    }
});
async function loadProfile() {

    try {

        const response = await fetch("/api/profile");

        const profile = await response.json();

        console.log(profile);

    } catch (error) {

        console.error("Failed to load profile:", error);

    }
}

loadProfile();