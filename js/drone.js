const API_URL = "http://192.168.1.102:8080";

function setLoading() {
    $.each( $("input[id^='people-']"), function () {
        $(this).attr("disabled", true);
    });

    $.each( $("input[id^='vehicle-']"), function () {
        $(this).attr("disabled", true);
    });

    $('.btn-update').attr("disabled", true);
}

function releaseLoading() {
    $.each( $("input[id^='people-']"), function () {
        $(this).attr("disabled", false);
    });

    $.each( $("input[id^='vehicle-']"), function () {
        $(this).attr("disabled", false);
    });

    $('.btn-update').attr("disabled", false);

}

function setSettings(settings){
    $.each( $("input[id^='people-']"), function () {
        $(this).attr("checked", !!settings['people'][$(this).attr('id').split("people-")[1]]);
    });

    $.each( $("input[id^='vehicle-']"), function () {
        $(this).attr("checked", !!settings['vehicle'][$(this).attr('id').split("vehicle-")[1]]);
    });
}

function getSettings() {
    const setting = {people: {}, vehicle: {}};

    $.each( $("input[id^='people-']"), function () {
        setting['people'][$(this).attr('id').split("people-")[1]] = +$(this).is(":checked");
    });

    $.each( $("input[id^='vehicle-']"), function () {
        setting['vehicle'][$(this).attr('id').split("vehicle-")[1]] = +$(this).is(":checked");
    });

    return setting;
}


$('.btn-update').click(async () => {
    await updateDroneSetting(getSettings())
})



async function updateDroneSetting(data) {
    try {
        setLoading();
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        console.log(data);
        const jData = await response.json();
        console.log(jData);
    } catch (error) {
        console.log(error);
    } finally {
        releaseLoading();
    }
}

(async function getDroneSetting() {
    try {
        setLoading();
        const response =  await fetch(API_URL);
        const data = await response.json();
        setSettings(data);
    } catch (error) {
        console.log(error);
    } finally {
        releaseLoading();
    }
})()

