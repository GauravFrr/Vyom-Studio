const sharedPlatforms = new Set();
let pendingPlatform = null;

function openPopup() {
    document.getElementById('suOverlay').classList.add('su-overlay--active');
    window.addEventListener('focus', onWindowFocus);
}

function handleShare(platform) {
    pendingPlatform = platform;
}

function onWindowFocus() {
    if (pendingPlatform) {
        markShared(pendingPlatform);
        pendingPlatform = null;
    }
}

function markShared(platform) {
    if (sharedPlatforms.has(platform)) return;
    sharedPlatforms.add(platform);

    const btn = document.getElementById('btn-' + platform);
    if (btn) btn.classList.add('su-platform-btn--shared');

    updateProgress();
    closePopupWithSuccess();
}

function updateProgress() {
    const fill = document.getElementById('suProgressFill');
    const label = document.getElementById('suProgressLabel');
    const count = sharedPlatforms.size;
    fill.style.width = Math.min(count * 100, 100) + '%';
    label.textContent = count === 0
        ? 'Share on 1 platform to unlock'
        : `Shared on ${count} platform${count > 1 ? 's' : ''} — unlocking…`;
}

function closePopupWithSuccess() {
    document.getElementById('suSuccess').style.display = 'block';
    document.getElementById('suProgressFill').style.width = '100%';
    document.getElementById('suProgressLabel').style.display = 'none';

    setTimeout(() => {
        document.getElementById('suOverlay').classList.remove('su-overlay--active');
        window.removeEventListener('focus', onWindowFocus);

    }, 2500);
}


var countChecker = 0;
function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1);
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

function checkRateLimit() {
    var now = Date.now();
    var cookieName = "ajax_requests_ip";
    var timestamps = getCookie(cookieName);
    var oneHour = 60 * 60 * 1000;

    if (timestamps === "") {
        setCookie(cookieName, now, 1);
        return { allowed: true };
    }

    var arr = timestamps.split(",").map(Number);

    while (arr.length > 0 && now - arr[0] > oneHour) {
        arr.shift();
    }

    if (arr.length >= 6) {
        var resetTime = arr[0] + oneHour;
        var remainingMs = resetTime - now;
        var minutes = Math.floor(remainingMs / 60000);
        var seconds = Math.floor((remainingMs % 60000) / 1000);
        return {
            allowed: false,
            minutes: minutes,
            seconds: seconds
        };
    }

    arr.push(now);
    setCookie(cookieName, arr.join(","), 1);
    return { allowed: true };
}
jQuery(document).ready(function ($) {

    // ============= Checking cookie ==============//

    // VEO Video Generator
    $('#generate_it').click(function () {
        if ($('#generate_it').attr('process') == 'true') {
            return false;
        }
        $('#generate_it').attr('process', 'true');


        let prompt = $('#fn__include_textarea').val();
        if (prompt == "") {
            return 0;
        }

        if (prompt.length < 15) {
            $('#msg').text("Prompt length must be greater than 15 characters...");
            $('#alert').show().addClass('show');
            $('#bar').addClass('anim');
            setTimeout(() => $('#alert').removeClass('show').hide(), 5000);
            return 0;
        }


        let totalVariations = $('#total-variations').val();
        let aspectRatio = $('#aspect-ration').val();

        let ratioClass = "";
        if (aspectRatio == "VIDEO_ASPECT_RATIO_LANDSCAPE") {
            ratioClass = "landscape-view";
        }


        // =========== YouTube Popup Cookie to show ============//
        let socialCook = getCookie("ytPopup");
        if (socialCook == "") {
            const date = new Date();
            date.setTime(date.getTime() + (99 * 60 * 60 * 1000));
            document.cookie = "ytPopup=1; expires=" + date.toUTCString() + "; path=/; SameSite=Lax";
        }
        else {
            socialCook = parseInt(socialCook) + 1;
        }

        let socialHide = getCookie("ytHide");
        if (socialCook >= 6 && socialHide == "") {
            loadPopupYT();
        }
        // =========== end of youtube popup cookie check

        var twoDays = 2; // Days for the cookie to last


        let watchCount = getCookie("videoCounter");
        let isLockedOut = getCookie("popupLockout");

        // 1. If the 2-day lockout cookie exists, just play the video and do nothing else
        if (isLockedOut !== "") {
            console.log("In 2-day cooldown period. Popup hidden.");
        }

        // 2. Manage the counter
        let count = watchCount === "" ? 0 : parseInt(watchCount);
        count++;

        if (count >= 4) {
            // 3. Trigger Popup on the 4th watch
            const day = new Date().getDate();
            const result = day % 2 === 0 ? "Even" : "Odd";
            if (result == "Odd") {
                openPopup();
            }


            // 4. Reset counter and set the 2-day lockout cookie
            setCookie("videoCounter", "0", twoDays);
            setCookie("popupLockout", "active", twoDays);
        } else {
            // 5. Update the counter cookie (keep it alive for 2 days)
            setCookie("videoCounter", count.toString(), twoDays);
            console.log("Videos watched so far: " + count);
        }


        let li = '';
        for (var i = 0; i < totalVariations; i++) {
            li = li + '<li class="fn__gl_item"><a  href="" class="fn__icon_button downloader-video-btn only-video-download" download><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download-icon lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg></a><div class="fn__gl__item"><div class="show-percentage">1%</div><div class="abs_item"><div class="placeholder"><div class="animated-background"></div></div><div class="all_options"><div class="fn__icon_options medium_size"></div></div></div></div></li>';
        }
        $(this).parents('.tab-panel').find('.generation_history').prepend('<div class="fn__generation_item video-gen-cont video-gen-item-1 ' + ratioClass + '"><div class="item_header"><div class="title_holder"><h2 class="prompt_title">' + prompt + ' </h2><p class="negative_prompt_title">Generating Video...</p></div></div><div class="item_list"><ul class="fn__generation_list">' + li + '</ul></div></div>');


        //changing percentage value
        $('.show-percentage').each(function () {
            $(this).prop('Counter', 0).animate({
                Counter: 100
            }, {
                duration: 99000, // 50 seconds
                easing: 'swing',
                step: function (now) {
                    $(this).text(Math.ceil(now) + '%');
                }
            });
        });



        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                prompt: prompt,
                totalVariations: totalVariations,
                aspectRatio: aspectRatio,
                actionType: 'full-video-generate'

            },
            success: function (response) {
                console.log(response);
                if (response.includes('In Progress')) {
                    $('body').append(`
                <div id="dark-popup" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999;">
                    <div style="background:#222; color:#fff; padding:20px; border-radius:8px; border:1px solid #444; max-width:400px; text-align:center;">
                        <p>${response}</p>
                        <button onclick="$('#dark-popup').remove()" style="background:#444; color:#fff; border:none; padding:8px 16px; cursor:pointer; border-radius:4px;">Close</button>
                    </div>
                </div>
            `);
                    $('#tab1 .video-gen-item-1').remove();
                }
                if (response.includes('Error') || response.includes('failed') || response.includes('retry') || response.includes('Limit')) {
                    $('.video-gen-item-1 .show-percentage').after("<div class='error-msg-perc'>" + response + "</div>");
                    document.getElementById('overlay1').style.display = 'flex';
                    return 0;
                }
                setTimeout(function () {
                    getVideoData(response);
                }, 85000);




            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        });
    });
    function getVideoData(sceneData) {
        console.log(sceneData);
        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                sceneData: sceneData,
                actionType: 'final-video-results'

            },
            success: function (response) {

                if (response.trim() == "") {
                    setTimeout(function () {
                        getVideoData(sceneData);
                    }, 20000);
                }
                else {
                    var id = response.trim();
                    if (id.includes('videos')) {
                        id = id.replace('videos/', 'video/');
                    }


                    //================= checking the resutl and showing alerts if error ==========//
                    if (response.length > 15) {

                        //Rate limit
                        if (response.includes("Rate Limit") || response.includes("Error") || response.includes("retry")) {
                            $('.video-gen-item-1 .show-percentage').after(response);
                            document.getElementById('overlay1').style.display = 'flex';
                            return 0;
                        }
                    }



                    for (var i = 0; i <= 1; i++) {
                        let j = i + 1;
                        $('ul.fn__generation_list li:nth-child(' + j + ')').find('.show-percentage, .placeholder').remove();
                        $('.negative_prompt_title').text("We Don't host or save the video so please download this video.");

                        let videoHtml = '<video src="' + id + '" style="width:100%;" controls preload="auto"></video>';
                        let $video = $(videoHtml);
                        $('ul.fn__generation_list li:nth-child(' + j + ')').prepend($video);
                        $video[0].load();
                        $('ul.fn__generation_list li:nth-child(' + j + ')').find('a').attr('href', id);

                        $('ul.fn__generation_list li:nth-child(' + j + ')').addClass("Half");
                    }
                    $('#generate_it').removeAttr('process');
                    return 0;
                }

            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        });
    }

    // ================== Nano Banana Image Generator ===============//
    $('#generate_it_img').click(function () {
        let promptIMG = $('#fn__include_textarea2').val();
        if (promptIMG == "") {
            return 0;
        }



        let totalVariationsIMG = $('#total-variations2').val();
        let aspectRatioIMG = $('#aspect-ration2').val();

        let ratioClassIMG = "";
        if (aspectRatioIMG == "IMAGE_ASPECT_RATIO_LANDSCAPE") {
            ratioClassIMG = "landscape-view";
        }
        let listData = '';
        for (var i = 1; i <= totalVariationsIMG; i++) {
            listData = listData + '<li class="fn__gl_item"><div class="fn__gl__item"><div class="show-percentage">1%</div><div class="abs_item"><div class="placeholder"><div class="animated-background"></div></div><div class="all_options"><div class="fn__icon_options medium_size"><a  href="" class="fn__icon_button downloader-video-btn" download><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" viewBox="0 0 383.3 383.3" style="enable-background:new 0 0 383.3 383.3" xml:space="preserve" class="fn__svg replaced-svg"><g><path d="M20.3,383.3c-1.4-0.5-2.8-0.9-4.2-1.4c-10.8-3.8-17.5-15-15.8-25.9c1.9-11.6,11.3-20.1,22.8-20.5c1.5-0.1,3,0,4.5,0   c108.8,0,217.7,0,326.5,0c17.3,0,23.1,4,29.2,20.2c0,2.5,0,5,0,7.5c-0.8,2.3-1.5,4.7-2.5,6.9c-3.6,7.4-9.9,11.3-17.7,13.3   C248.8,383.3,134.5,383.3,20.3,383.3z"></path><path d="M216.8,208.4c0.8-1.1,1.5-2.4,2.4-3.3c13.4-13.4,26.8-26.9,40.2-40.2c6.7-6.6,14.8-8.7,23.8-6.2   c8.9,2.5,14.6,8.6,16.6,17.6c2,9-0.7,16.7-7.2,23.2c-22.5,22.5-45,45-67.5,67.5c-5.2,5.2-10.4,10.4-15.6,15.6   c-10.7,10.6-24.9,10.7-35.6,0.1c-27.8-27.7-55.6-55.6-83.4-83.4c-6.8-6.8-9.3-15-6.7-24.3c2.5-8.9,8.6-14.6,17.6-16.6   c8.8-2,16.5,0.5,22.9,6.9c13.2,13.2,26.5,26.5,39.7,39.7c1,1,1.7,2.1,2.6,3.2c0.4-0.1,0.7-0.3,1.1-0.4c0-1.4,0-2.8,0-4.2   c0-59.5,0-119,0-178.5c0-14.6,10.6-25.3,24.5-25.1c12.5,0.2,22.8,10.3,23.4,22.8c0.1,3,0.1,6,0.1,9c0,57.3,0,114.5,0,171.8   c0,1.3,0,2.7,0,4C216,207.9,216.4,208.1,216.8,208.4z"></path></g></svg></a></div></div></div></div></li>';
        }
        $('#generate_it').attr('disabled', 'true');
        $(this).parents('.tab-panel').find('.generation_history').prepend('<div class="fn__generation_item video-gen-item-1 ' + ratioClassIMG + '"><div class="item_header"><div class="title_holder"><h2 class="prompt_title">' + promptIMG + ' </h2><p class="negative_prompt_title">Generating image...</p></div></div><div class="item_list"><ul class="fn__generation_list">' + listData + '</ul></div></div>');

        //changing percentage value
        var $element = $(this);
        $(this).parents('.tab-panel').find('.show-percentage').each(function () {
            var $element = $(this);

            $element.stop().data('counter', 0).animate({
                counter: 100
            }, {
                duration: 20000, // Reduced duration for better UX
                easing: 'swing',
                step: function (now) {
                    $element.text(Math.ceil(now) + '%');
                }
            });
        });



        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                promptIMG: promptIMG,
                totalVariationsIMG: totalVariationsIMG,
                aspectRatioIMG: aspectRatioIMG,
                actionType: 'banan-image-generator'
            },
            success: function (response) {
                $('#generate_it').removeAttr('disabled');

                let imgData = response.split(',');

                $('.show-percentage, .placeholder').remove();
                $('.negative_prompt_title').text("We Don't host or save the images so please download these images.");
                let imgHtml = '';
                for (var i = 0; i < imgData.length; i++) {

                    imgHtml = imgHtml + '<li class="fn__gl_item"><div class="fn__gl__item"><div class="abs_item"><img src="data:image/png;base64,' + imgData[i] + '"><div class="all_options"><div class="fn__icon_options medium_size"><a href="" class="fn__icon_button downloader-img-btn" download><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" viewBox="0 0 383.3 383.3" style="enable-background:new 0 0 383.3 383.3" xml:space="preserve" class="fn__svg replaced-svg"><g><path d="M20.3,383.3c-1.4-0.5-2.8-0.9-4.2-1.4c-10.8-3.8-17.5-15-15.8-25.9c1.9-11.6,11.3-20.1,22.8-20.5c1.5-0.1,3,0,4.5,0   c108.8,0,217.7,0,326.5,0c17.3,0,23.1,4,29.2,20.2c0,2.5,0,5,0,7.5c-0.8,2.3-1.5,4.7-2.5,6.9c-3.6,7.4-9.9,11.3-17.7,13.3   C248.8,383.3,134.5,383.3,20.3,383.3z"></path><path d="M216.8,208.4c0.8-1.1,1.5-2.4,2.4-3.3c13.4-13.4,26.8-26.9,40.2-40.2c6.7-6.6,14.8-8.7,23.8-6.2   c8.9,2.5,14.6,8.6,16.6,17.6c2,9-0.7,16.7-7.2,23.2c-22.5,22.5-45,45-67.5,67.5c-5.2,5.2-10.4,10.4-15.6,15.6   c-10.7,10.6-24.9,10.7-35.6,0.1c-27.8-27.7-55.6-55.6-83.4-83.4c-6.8-6.8-9.3-15-6.7-24.3c2.5-8.9,8.6-14.6,17.6-16.6   c8.8-2,16.5,0.5,22.9,6.9c13.2,13.2,26.5,26.5,39.7,39.7c1,1,1.7,2.1,2.6,3.2c0.4-0.1,0.7-0.3,1.1-0.4c0-1.4,0-2.8,0-4.2   c0-59.5,0-119,0-178.5c0-14.6,10.6-25.3,24.5-25.1c12.5,0.2,22.8,10.3,23.4,22.8c0.1,3,0.1,6,0.1,9c0,57.3,0,114.5,0,171.8   c0,1.3,0,2.7,0,4C216,207.9,216.4,208.1,216.8,208.4z"></path></g></svg></a></div></div></div></div></li>';
                }
                console.log(imgHtml);

                $element.parents('.tab-panel').find('ul.fn__generation_list').html(imgHtml);



            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        });
    });

    $('#video-submit-btn').click(function () {


        let prompt = $('#videoPrompt').val();
        if (prompt == "") {
            return 0;
        }
        else {

        }

    });

    $('.svg-setting').click(function () {
        $('.tab-panel.active').find('.generation__sidebar').toggleClass('show-flex');
        $('.tab-panel.active').find('.header_bottom').toggleClass("margin-prompt-text");
        console.log("abc");
    });

    // =========== Download image ==============//
    $(document).on('click', '.downloader-img-btn', function (e) {
        e.preventDefault();
        var $absItem = $(this).parents('.abs_item');
        var $img = $absItem.find('img');
        var base64Image = $img.attr('src');
        if (!$img.length) {
            console.error('No img element found within .abs_item');
            return;
        }
        if (!base64Image || !base64Image.startsWith('data:image/')) {
            console.error('Invalid or missing base64 image data:', base64Image);
            return;
        }
        var base64Data = base64Image.split(',')[1];
        if (!base64Data) {
            console.error('Failed to parse base64 data');
            return;
        }
        try {
            var byteCharacters = atob(base64Data);
            var byteNumbers = new Array(byteCharacters.length);
            for (var i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            var byteArray = new Uint8Array(byteNumbers);
            var blob = new Blob([byteArray], { type: 'image/jpeg' });
            var url = window.URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = `image_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error processing base64 image:', error);
        }
    });

    // ========== Text prompt ==============//
    $('#generate_it_prompt').click(function () {
        let prompt = $('.text-prompt-gen').val();
        if (prompt == "") {
            $('#msg').text("Enter your idea in the prompt box...");
            $('#alert').show().addClass('show');
            $('#bar').addClass('anim');
            setTimeout(() => $('#alert').removeClass('show').hide(), 5000);
            return 0;
        }


        $(this).after('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader lucide-animate-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>');
        $(this).attr('disabled', 'true');


        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                prompt: prompt,
                actionType: 'main-prompt-generation'

            },
            success: function (response) {

                if (response != "empty") {
                    $('.text-prompt-gen').val(response);
                }
                $('#generate_it_prompt').removeAttr('disabled');
                $('.lucide-animate-loader').remove();

            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        });
    });


    // ========== Text prompt ==============//
    $('.megic-prompt').click(function () {
        let prompt = $('#fn__include_textarea').val();
        if (prompt == "") {
            $('#msg').text("Enter your idea in the prompt box...");
            $('#alert').show().addClass('show');
            $('#bar').addClass('anim');
            setTimeout(() => $('#alert').removeClass('show').hide(), 5000);
            return 0;
        }


        $('#generate_it').after('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader lucide-animate-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>');
        $(this).attr('disabled', 'true');


        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                prompt: prompt,
                actionType: 'main-prompt-generation'

            },
            success: function (response) {

                if (response != "empty") {
                    $('#fn__include_textarea').val(response);
                }

                $('.lucide-animate-loader').remove();

            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        });
    });

    // ============= Image to Video ============//
    $('#generate_it_img_video').click(function () {
        if ($('#generate_it').attr('process') == 'true') {
            return false;
        }
        $('#generate_it').attr('process', 'true');
        // ======== Check Rate Limit ===========//
        /*
       var result = checkRateLimit();
        if (!result.allowed) {
            $('.rate-limit-exceed').remove();
            var msg = result.minutes > 0 
                ? `Create again after ${result.minutes} minute${result.minutes > 1 ? 's' : ''} ${result.seconds} second${result.seconds > 1 ? 's' : ''}`
                : `Create again after ${result.seconds} second${result.seconds > 1 ? 's' : ''}`;
                
            $('#tab1 .generate_section').after('<div class="rate-limit-exceed"><p><span>Rate Limit Exceeded: </span>VEO AI is experiencing high usage and only allows 5 video generations per hour. ' + msg + '</p></div>');
            return false;
        }
        */
        let prompt = $('#fn__include_textarea_img_video').val();
        if (prompt == "") {
            return 0;
        }

        let totalVariations = $('#total-variations_img_video').val();
        let aspectRatio = $('#aspect-ration-img-video').val();

        let ratioClass = "";
        if (aspectRatio == "VIDEO_ASPECT_RATIO_LANDSCAPE") {
            ratioClass = "landscape-view";
        }


        $('#generate_it_img_video').attr('disabled', 'true');
        let li = '';
        for (var i = 0; i < 1; i++) {
            li = li + '<li class="fn__gl_item"><a  href="" class="fn__icon_button downloader-video-btn only-video-download" download><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download-icon lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg></a><div class="fn__gl__item"><div class="show-percentage">1%</div><div class="abs_item"><div class="placeholder"><div class="animated-background"></div></div><div class="all_options"><div class="fn__icon_options medium_size"></div></div></div></div></li>';
        }
        $(this).parents('.tab-panel').find('.generation_history').prepend('<div class="fn__generation_item video-gen-cont video-gen-item-1 ' + ratioClass + '"><div class="item_header"><div class="title_holder"><h2 class="prompt_title">' + prompt + ' </h2><p class="negative_prompt_title">Generating Video...</p></div></div><div class="item_list"><ul class="fn__generation_list">' + li + '</ul></div></div>');

        //changing percentage value
        $('.show-percentage').each(function () {
            $(this).prop('Counter', 0).animate({
                Counter: 100
            }, {
                duration: 80000, // 50 seconds
                easing: 'swing',
                step: function (now) {
                    $(this).text(Math.ceil(now) + '%');
                }
            });
        });

        // 1. Grab the file from the input


        // 2. Initialize FormData
        var formData = new FormData();

        // 3. Append your data
        formData.append('action', 'veo_video_generator');
        formData.append('nonce', ajax_object.nonce);
        formData.append('prompt', prompt);
        formData.append('totalVariations', totalVariations);
        formData.append('aspectRatio', aspectRatio);
        formData.append('actionType', 'img-to-video-start');

        var fileInput = $('.attach-img-1')[0]; // Access the DOM element

        // Check if a file actually exists in the input
        if (fileInput.files.length > 0) {
            formData.append('img1', fileInput.files[0]);
        }

        // 4. The Updated AJAX Call
        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                console.log(response);
                setTimeout(function () {
                    getVideoData(response);
                }, 40000);
            },
            error: function (xhr, status, error) {
                console.log('AJAX Error: ' + error);
            }
        }); //ajax end

    });
    let currentOffset = 4;

    function loadVideoItem($item) {
        let sceneData = $item.data('scene');
        let $li = $item.find('ul.fn__generation_list2 li');
        $li.find('.placeholder').remove();
        let videoHtml = '<video src="' + sceneData + '"  style="width:100%;" controls preload="auto"></video>';
        $li.prepend($(videoHtml));

        $item.find('.prompt_title').text('');
        $item.find('.item_header').remove();



    }
    // ======== Load more items ===========//
    $('.fn__generation_item.video-gen-cont').each(function () {

        loadVideoItem($(this));
    });
    $(document).on('click', '#load-more-history', function () {
        $.post(ajax_object.ajax_url, {
            action: 'load_more_video_history',
            nonce: ajax_object.nonce,
            offset: currentOffset
        }, function (html) {
            if (html.trim()) {
                console.log(html);
                $('.fn__generation_item:last').remove();
                $('.generation_history2 .generation_history2').after(html);
                currentOffset += 4;
                clickLoad = 1;
                console.log("item added");

                $('.fn__generation_item').slice(-4).each(function () { loadVideoItem($(this)); });
            } else { $('#load-more-history').remove(); }
        });
    });

    // ========= YouTube Popup completed check ===============//
    $('body').on('click', '.btn-completed-sub', function () {
        $(this).after('<label style="text-align:center">Please, we are checking...</label>');

        $('.channel-grid a').each(function () {
            var dataID = $(this).attr('data-id');

            $.ajax({
                url: ajax_object.ajax_url,
                type: 'POST',
                data: {
                    action: 'veo_video_generator',
                    nonce: ajax_object.nonce,
                    dataID: dataID,
                    actionType: 'get-subscriber-count-before'

                },
                success: function (response) {
                    let obj = JSON.parse(response);
                    let subcount = obj.data[0].snippet.subcount;
                    let oldSubCount = $('a[data-id="' + dataID + '"').attr('sub-count');
                    if (pareseInt(subcount) > pareseInt(oldSubCount)) {
                        var tenDays = 1000 * 60000 * 60 * 24 * 2;
                        setCookie("videoCounter", "0", tenDays);
                        setCookie("cookiClicked", "1", tenDays);
                        setCookie("ytPopup", "1", tenDays);
                        setCookie("ytHide", "1", tenDays);

                        $('.yt-overlay').remove();
                    }
                }

            });
        });


    });

    function loadPopupYT() {
        $('body').append('<style>.yt-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:#000000bf;display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box}.yt-popup-container{background:#222;color:#fff;border-radius:16px;padding:25px;max-width:900px;width:100%;box-shadow:0 10px 40px #0006;animation:popupFadeIn .4s ease-out}@keyframes popupFadeIn{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}.yt-popup-container h2{text-align:center;margin:0 0 10px;font-size:24px;color:#8dfb0b;font-weight:600}.yt-popup-container p{text-align:center;margin:0 0 25px;color:#fff;font-size:15px}.channel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.yt_popup_box{display:flex;align-items:center;background:#000;padding:14px;border-radius:12px;box-shadow:0 6px 20px #00000026;transition:all .3s ease;text-decoration:none;color:#fff}.yt_popup_box:hover{transform:translateY(-6px);box-shadow:0 12px 30px #00000040;background:linear-gradient(270deg,#ffe552 -8.96%,#adff33 100%)}.yt_popup_box:hover .yt_popup_title{color:#000}.yt_popup_pic{width:64px;height:64px;border-radius:50%;object-fit:cover;margin-right:14px;flex-shrink:0}.yt_popup_title{font-size:16px;font-weight:400;margin-bottom:6px;color:#c4c0c0}.sub_btn_box{display:flex;align-items:center;gap:6px;color:red;font-weight:700;font-size:14px}.sub_btn_box svg{width:18px;height:18px;fill:red}.btn-completed{display:block;margin:auto;margin-top:18px;background:#000;color:#bdbdbd;border-radius:6px;line-height:1;padding:10px 20px;width:100%;max-width:300px;border:1px solid #414040}.btn-completed:hover{background:linear-gradient(270deg,#ffe552 -8.96%,#adff33 100%);color:#000;cursor:pointer}p.text-yt-bottom{margin-top:14px;color:#9b9b9b}@media (max-width: 768px){.channel-grid{grid-template-columns:repeat(2,1fr)}.yt-popup-container{padding:10px 0}.yt_popup_pic{width:40px;height:40px}.yt_popup_title{font-size:14px}.yt_popup_box{padding:10px 2px}}</style><div class="yt-overlay"><div class="yt-popup-container"><h2>Subscribe our YouTube channel</h2><p>This is our Sponsor YouTube Channel. Please, subscribe this and  after subscribing, you can continue creating videos.</p><div class="channel-grid"><a href="https://www.youtube.com/@halwatech007" target="_blank" class="yt_popup_box" data-id="UCk3aRSa5wvTYmTjTNGKNzDA"><img class="yt_popup_pic" src="https://yt3.googleusercontent.com/WsEQsmnFv2w_qNosZMwRrLfb5KMEM2qLMDWZXpZE4spDOIW8SPHIdCz6P6QKJt90WLHSGu2i0Q=s160-c-k-c0x00ffffff-no-rj" alt="subscribe gaming channel"><div><div class="yt_popup_title">@halwatech007</div><div class="sub_btn_box"><svg viewBox="0 0 24 24"><path d="M23.499 6.203a2.893 2.893 0 0 0-2.036-2.045C19.28 3.5 12 3.5 12 3.5s-7.28 0-9.463.658a2.893 2.893 0 0 0-2.036 2.045A30.38 30.38 0 0 0 0 12a30.38 30.38 0 0 0 .501 5.797 2.893 2.893 0 0 0 2.036 2.045C4.72 20.5 12 20.5 12 20.5s7.28 0 9.463-.658a2.893 2.893 0 0 0 2.036-2.045A30.38 30.38 0 0 0 24 12a30.38 30.38 0 0 0-.501-5.797zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg>Subscribe</div></div></a></div><p class="text-yt-bottom">*Click on the "Completed" button after subscribing one of the channel and<strong> after that you can create more videos</strong>. We will appreciate your help!</p><button class="btn-completed btn-completed-sub">Completed</button></div></div>');
        $('.channel-grid a').each(function () {
            var dataID = $(this).attr('data-id');

            $.ajax({
                url: ajax_object.ajax_url,
                type: 'POST',
                data: {
                    action: 'veo_video_generator',
                    nonce: ajax_object.nonce,
                    dataID: dataID,
                    actionType: 'get-subscriber-count-before'

                },
                success: function (response) {
                    let obj = JSON.parse(response);
                    let subcount = obj.data[0].snippet.subcount;
                    $('a[data-id="' + dataID + '"').attr('sub-count', subcount);
                }

            });
        });
    }

    //============== Whisk image upload ===========//
    $('.btn-image-upload .img-inner-banana').each(function () {
        var $container = $(this);
        var $svg = $container.find('svg');
        var $input = $container.find('input[type="file"]');
        var $label = $container.find('label');

        $svg.css('cursor', 'pointer');

        $svg.on('click', function () {
            $input.trigger('click');
        });

        $input.on('change', function (e) {
            var file = e.target.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function (ev) {
                    var base64 = ev.target.result;

                    $svg.hide();
                    $label.text('Remove');

                    var $preview = $('<div class="img-preview-whisk img-whisk-loading"><div class="text-upoading-whish">Uploading...</div>').css({
                        width: '100px',
                        height: '100px',
                        backgroundImage: 'url(' + base64 + ')',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                    });

                    var $remove = $('<div>').text('✕').css({
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        textAlign: 'center',
                        lineHeight: '20px',
                        fontSize: '14px',
                        cursor: 'pointer'
                    });

                    $container.css('position', 'relative');
                    $container.append($preview).append($remove);
                    var mediaType = $input.attr('data-type');
                    console.log("Media Type:" + mediaType);



                    // ========= ajax for image upload ============//
                    $.ajax({
                        url: ajax_object.ajax_url,
                        type: 'POST',
                        data: {
                            action: 'veo_video_generator',
                            nonce: ajax_object.nonce,
                            base64: base64,
                            mediaType: mediaType,
                            actionType: 'whisk_object_image'

                        },
                        success: function (response) {
                            console.log(response);
                            response.trim();
                            response = response.split(';;;;');
                            if (response[0]) {
                                $preview.removeClass('img-whisk-loading');
                                $('.text-upoading-whish').remove();
                                $preview.attr('data-code', response[1]);
                                $preview.attr('data-text', response[0]);
                                $preview.attr('data-flow', response[2]);


                            }
                            else {
                                $preview.removeClass('img-whisk-loading');
                                $('.text-upoading-whish').text('Error in uploading image. Try with a different image by reloading the web page').css({ "margin-top": "0", "min-width": "120px", "margin-left": "0" });
                            }


                        },
                        error: function (xhr, status, error) {
                            console.log('AJAX Error: ' + error);
                        }
                    });

                    $remove.on('click', function (e) {
                        e.stopPropagation();
                        $input.val('');
                        $preview.remove();
                        $remove.remove();
                        $svg.show();
                        $label.text($label.attr('for') === 'banana-first-img' ? 'Upload Object Image' : 'Upload Scene Image');
                    });

                    $preview.on('click', function () {
                        $input.trigger('click');
                    });
                };
                reader.readAsDataURL(file);
            }
        });
    });

    $('body').on('click', '.whisk-create-img', function () {

        //First img
        var dataCode = $('#banana-first-img').parents('.img-inner-banana').find('.img-preview-whisk').attr('data-code');
        var dataText = $('#banana-first-img').parents('.img-inner-banana').find('.img-preview-whisk').attr('data-text');
        var dataFlow = $('#banana-first-img').parents('.img-inner-banana').find('.img-preview-whisk').attr('data-flow');

        var dataCode2 = $('#banana-attach-scene').parents('.img-inner-banana').find('.img-preview-whisk').attr('data-code');
        var dataText2 = $('#banana-attach-scene').parents('.img-inner-banana').find('.img-preview-whisk').attr('data-text');

        var promptText = $('.tab-panel.active textarea').val();
        if (!promptText) {
            alert("Prompt text is missing");
            return 0;
        }

        let totalVariationsIMG = $('#total-variations2').val();
        let aspectRatioIMG = $('#aspect-ration2').val();

        let ratioClassIMG = "";
        if (aspectRatioIMG == "IMAGE_ASPECT_RATIO_LANDSCAPE") {
            ratioClassIMG = "landscape-view";
        }
        let listData = '';
        for (var i = 1; i <= totalVariationsIMG; i++) {
            listData = listData + '<li class="fn__gl_item"><div class="fn__gl__item"><div class="show-percentage">1%</div><div class="abs_item"><div class="placeholder"><div class="animated-background"></div></div><div class="all_options"><div class="fn__icon_options medium_size"><a  href="" class="fn__icon_button downloader-video-btn" download><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" viewBox="0 0 383.3 383.3" style="enable-background:new 0 0 383.3 383.3" xml:space="preserve" class="fn__svg replaced-svg"><g><path d="M20.3,383.3c-1.4-0.5-2.8-0.9-4.2-1.4c-10.8-3.8-17.5-15-15.8-25.9c1.9-11.6,11.3-20.1,22.8-20.5c1.5-0.1,3,0,4.5,0   c108.8,0,217.7,0,326.5,0c17.3,0,23.1,4,29.2,20.2c0,2.5,0,5,0,7.5c-0.8,2.3-1.5,4.7-2.5,6.9c-3.6,7.4-9.9,11.3-17.7,13.3   C248.8,383.3,134.5,383.3,20.3,383.3z"></path><path d="M216.8,208.4c0.8-1.1,1.5-2.4,2.4-3.3c13.4-13.4,26.8-26.9,40.2-40.2c6.7-6.6,14.8-8.7,23.8-6.2   c8.9,2.5,14.6,8.6,16.6,17.6c2,9-0.7,16.7-7.2,23.2c-22.5,22.5-45,45-67.5,67.5c-5.2,5.2-10.4,10.4-15.6,15.6   c-10.7,10.6-24.9,10.7-35.6,0.1c-27.8-27.7-55.6-55.6-83.4-83.4c-6.8-6.8-9.3-15-6.7-24.3c2.5-8.9,8.6-14.6,17.6-16.6   c8.8-2,16.5,0.5,22.9,6.9c13.2,13.2,26.5,26.5,39.7,39.7c1,1,1.7,2.1,2.6,3.2c0.4-0.1,0.7-0.3,1.1-0.4c0-1.4,0-2.8,0-4.2   c0-59.5,0-119,0-178.5c0-14.6,10.6-25.3,24.5-25.1c12.5,0.2,22.8,10.3,23.4,22.8c0.1,3,0.1,6,0.1,9c0,57.3,0,114.5,0,171.8   c0,1.3,0,2.7,0,4C216,207.9,216.4,208.1,216.8,208.4z"></path></g></svg></a></div></div></div></div></li>';
        }
        $('#generate_it').attr('disabled', 'true');
        $(this).parents('.tab-panel').find('.generation_history').prepend('<div class="fn__generation_item video-gen-item-1 ' + ratioClassIMG + '"><div class="item_header"><div class="title_holder"><h2 class="prompt_title">' + promptText + ' </h2><p class="negative_prompt_title">Generating image...</p></div></div><div class="item_list"><ul class="fn__generation_list">' + listData + '</ul></div></div>');

        //changing percentage value
        var $element = $(this);
        $(this).parents('.tab-panel').find('.show-percentage').each(function () {
            var $element = $(this);

            $element.stop().data('counter', 0).animate({
                counter: 100
            }, {
                duration: 20000, // Reduced duration for better UX
                easing: 'swing',
                step: function (now) {
                    $element.text(Math.ceil(now) + '%');
                }
            });
        });


        var totalImages = $('#total-variations2').val();
        var ratio = $('#aspect-ration2').val();
        $.ajax({
            url: ajax_object.ajax_url,
            type: 'POST',
            data: {
                action: 'veo_video_generator',
                nonce: ajax_object.nonce,
                dataCode: dataCode,
                dataText: dataText,
                dataFlow: dataFlow,
                dataCode2: dataCode2,
                dataText2: dataText2,
                promptText: promptText,
                totalImages: totalImages,
                ratio: ratio,
                actionType: 'whisk_final_image'

            },
            success: function (response) {
                console.log(response);
                // Force cleaning the string in case there is whitespace/hidden characters
                if (typeof response === 'string') {
                    try {
                        response = JSON.parse(response.trim());
                    } catch (e) {
                        console.error("JSON Parse failed. You might have extra text in your Python output.");
                        return;
                    }
                }

                let ratioCSS = "";
                let img = "";
                if (response.success === true || response.success === "true") {

                    img = response.data_uri;
                    ratioCSS = $('#aspect-ration2').val();
                }




                $('.show-percentage, .placeholder').remove();
                $('.negative_prompt_title').text("We Don't host or save the images so please download these images.");
                let imgHtml = '';

                imgHtml = imgHtml + '<li class="fn__gl_item ' + ratioCSS + '"><div class="fn__gl__item"><div class="abs_item"><img src="' + img + '"><div class="all_options"><div class="fn__icon_options medium_size"><a href="" class="fn__icon_button downloader-img-btn" download><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="Layer_1" x="0px" y="0px" viewBox="0 0 383.3 383.3" style="enable-background:new 0 0 383.3 383.3" xml:space="preserve" class="fn__svg replaced-svg"><g><path d="M20.3,383.3c-1.4-0.5-2.8-0.9-4.2-1.4c-10.8-3.8-17.5-15-15.8-25.9c1.9-11.6,11.3-20.1,22.8-20.5c1.5-0.1,3,0,4.5,0   c108.8,0,217.7,0,326.5,0c17.3,0,23.1,4,29.2,20.2c0,2.5,0,5,0,7.5c-0.8,2.3-1.5,4.7-2.5,6.9c-3.6,7.4-9.9,11.3-17.7,13.3   C248.8,383.3,134.5,383.3,20.3,383.3z"></path><path d="M216.8,208.4c0.8-1.1,1.5-2.4,2.4-3.3c13.4-13.4,26.8-26.9,40.2-40.2c6.7-6.6,14.8-8.7,23.8-6.2   c8.9,2.5,14.6,8.6,16.6,17.6c2,9-0.7,16.7-7.2,23.2c-22.5,22.5-45,45-67.5,67.5c-5.2,5.2-10.4,10.4-15.6,15.6   c-10.7,10.6-24.9,10.7-35.6,0.1c-27.8-27.7-55.6-55.6-83.4-83.4c-6.8-6.8-9.3-15-6.7-24.3c2.5-8.9,8.6-14.6,17.6-16.6   c8.8-2,16.5,0.5,22.9,6.9c13.2,13.2,26.5,26.5,39.7,39.7c1,1,1.7,2.1,2.6,3.2c0.4-0.1,0.7-0.3,1.1-0.4c0-1.4,0-2.8,0-4.2   c0-59.5,0-119,0-178.5c0-14.6,10.6-25.3,24.5-25.1c12.5,0.2,22.8,10.3,23.4,22.8c0.1,3,0.1,6,0.1,9c0,57.3,0,114.5,0,171.8   c0,1.3,0,2.7,0,4C216,207.9,216.4,208.1,216.8,208.4z"></path></g></svg></a></div></div></div></div></li>';


                $element.parents('.tab-panel').find('ul.fn__generation_list').html(imgHtml);
            }
        });

    });

    /*
    $('svg.fn__svg.replaced-svg.svg-setting').click(function(){
    $('.tab-panel.active').find('.generation__sidebar').toggleClass('show-flex');
    
    });
    */

    $('#generate_it_img').addClass('whisk-create-img');
    $('#generate_it_img').removeAttr('id');


    $('#generate_it, #generate_it_img_video').click(function () {
        $('html, body').animate({
            scrollTop: $(window).scrollTop() + 200
        }, 400);
    });
});


