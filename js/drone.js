const API_URL = "http://192.168.1.244:8080/";
// const API_URL = "http://192.168.1.102:8080/";

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

    $.each( $("input[id^='car-']"), function () {
        $(this).attr("checked", !!settings['car'][$(this).attr('id').split("car-")[1]]);
    });

    $.each( $("input[id^='vehicle-']"), function () {
        $(this).attr("checked", !!settings['vehicle'][$(this).attr('id').split("vehicle-")[1]]);
    });
}

function getSettings() {
    const setting = {people: {}, vehicle: {}, car: {}};

    $.each( $("input[id^='people-']"), function () {
        setting['people'][$(this).attr('id').split("people-")[1]] = +$(this).is(":checked");
    });

    $.each( $("input[id^='car-']"), function () {
        setting['car'][$(this).attr('id').split("car-")[1]] = +$(this).is(":checked");
    });

    $.each( $("input[id^='vehicle-']"), function () {
        setting['vehicle'][$(this).attr('id').split("vehicle-")[1]] = +$(this).is(":checked");
    });


    return setting;
}


function noData() {
    $('.container').hide();
    $('body').append(`<h1>LỖI KHI LẤY DỮ LIỆU RỒI BẠN Ạ 🤢</h1>`)
}

function setNotification(isSuccess) {
    $(".notification").show().addClass(isSuccess ? 'w3-green' : 'w3-red').removeClass(isSuccess ? 'w3-red' : 'w3-green');
    $(".message").text(isSuccess ? '👌 Bạn nhớ 💕💕💕' : '🤢 Lỗi rồi bạn ạ')
}

$('.btn-update').click(async () => {
    await updateDroneSetting(getSettings())
})



async function updateDroneSetting(data) {
    try {
        setLoading();
        const response = await fetch(API_URL, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        console.log(data);
        const jData = await response.json();
        console.log(jData);
        setNotification(true);
    } catch (error) {
        console.log(error);
        setNotification(false);
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
        noData();
    } finally {
        releaseLoading();
    }
})()

