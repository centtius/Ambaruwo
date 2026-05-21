import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// ===============================
// GLOBAL VARIABLES
// ===============================
let currentVrm = null;
const clock = new THREE.Clock();

// ===============================
// VISIBILITY CONTROL
// Smooth fade canvas + deteksi lengkap
// ===============================
let targetOpacity = 0;
let canvasOpacity = 0;
let lastDetectedTime = 0;

const HIDE_DELAY = 700;
const FADE_SPEED = 0.08;

function isPersonDetected(results) {
    return !!(
        results &&
        (
            results.faceLandmarks ||
            results.poseLandmarks ||
            results.poseWorldLandmarks ||
            results.leftHandLandmarks ||
            results.rightHandLandmarks
        )
    );
}

function updateAvatarFade() {
    if (!currentVrm) return;

    if (targetOpacity > 0) {
        currentVrm.scene.visible = true;
    }

    canvasOpacity += (targetOpacity - canvasOpacity) * FADE_SPEED;

    if (canvasOpacity < 0.01) canvasOpacity = 0;
    if (canvasOpacity > 0.99) canvasOpacity = 1;

    canvas.style.opacity = canvasOpacity.toString();

    if (targetOpacity === 0 && canvasOpacity <= 0.01) {
        currentVrm.scene.visible = false;
    }
}

function setDebugText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ===============================
// THREE.JS SETUP
// ===============================
const videoElement = document.getElementById('webcam');

// FIX: pakai canvas yang sudah ada kalau ada, kalau belum ada buat baru
let canvas = document.getElementById('canvas3d');

if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'canvas3d';
    document.body.appendChild(canvas);
}

Object.assign(canvas.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2',
    opacity: '0',
    pointerEvents: 'none'
});

const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    0.1,
    20
);

camera.position.set(0, 0, 1.2);
camera.lookAt(new THREE.Vector3(0, 0, 0));

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// ===============================
// LOAD VRM AVATAR
// ===============================
const loader = new GLTFLoader();

loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
});

loader.load(
    'char/karakter.vrm',

    (gltf) => {
        const vrm = gltf.userData.vrm;

        console.log("VRM Version:", vrm.meta?.metaVersion);
        console.log("Bones:", Object.keys(vrm.humanoid.humanBones));

        scene.add(vrm.scene);

        vrm.scene.rotation.y = Math.PI;
        vrm.scene.position.y = -1.2;

        // Awal disembunyikan, tapi bukan pakai opacity material
        // Jadi mata/model tidak rusak
        vrm.scene.visible = false;
        canvas.style.opacity = "0";
        targetOpacity = 0;
        canvasOpacity = 0;

        // Idle arm pose
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        const leftArm  = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");

        if (rightArm) rightArm.rotation.z = -1.2;
        if (leftArm)  leftArm.rotation.z  =  1.2;

        currentVrm = vrm;

        console.log("Avatar berhasil dimuat!");
        startTracking();
    },

    (progress) => {
        console.log('Loading model...', 100 * (progress.loaded / progress.total), '%');
    },

    (error) => {
        console.error("Gagal load VRM:", error);
    }
);

// ===============================
// HELPER: apply rotation dengan lerp
// ===============================
function applyRotation(bone, x, y, z, lerpFactor = 0.3) {
    if (!bone) return;

    bone.rotation.x += (x - bone.rotation.x) * lerpFactor;
    bone.rotation.y += (y - bone.rotation.y) * lerpFactor;
    bone.rotation.z += (z - bone.rotation.z) * lerpFactor;
}

// ===============================
// ANIMATE VRM
// ===============================
const animateVRM = (vrm, results) => {

    if (!vrm || !results || !window.Kalidokit) return;

    // ===============================
    // FACE TRACKING
    // ===============================
    if (results.faceLandmarks) {

        const faceRig = window.Kalidokit.Face.solve(
            results.faceLandmarks,
            { runtime: "mediapipe", video: videoElement }
        );

        if (faceRig) {

            const headNode = vrm.humanoid.getNormalizedBoneNode("head");
            const neckNode = vrm.humanoid.getNormalizedBoneNode("neck");

            if (neckNode) {
                applyRotation(
                    neckNode,
                    faceRig.head.x * 0.5,
                    faceRig.head.y * 0.5,
                    faceRig.head.z * 0.5
                );
            }

            if (headNode) {
                applyRotation(
                    headNode,
                    faceRig.head.x * 0.5,
                    faceRig.head.y * 0.5,
                    faceRig.head.z * 0.5
                );
            }

            if (vrm.expressionManager) {
                vrm.expressionManager.setValue("aa",         faceRig.mouth.shape.A);
                vrm.expressionManager.setValue("blinkLeft",  1 - faceRig.eye.l);
                vrm.expressionManager.setValue("blinkRight", 1 - faceRig.eye.r);
            }
        }
    }

    // ===============================
    // BODY TRACKING
    // ===============================
    if (results.poseWorldLandmarks) {

        const poseRig = window.Kalidokit.Pose.solve(
            results.poseWorldLandmarks,
            results.poseLandmarks,
            { runtime: "mediapipe", video: videoElement }
        );

        if (poseRig) {

            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("rightUpperArm"),
                poseRig.RightUpperArm.x,
                poseRig.RightUpperArm.y,
                poseRig.RightUpperArm.z
            );

            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("rightLowerArm"),
                poseRig.RightLowerArm.x,
                poseRig.RightLowerArm.y,
                poseRig.RightLowerArm.z
            );

            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("leftUpperArm"),
                poseRig.LeftUpperArm.x,
                poseRig.LeftUpperArm.y,
                poseRig.LeftUpperArm.z
            );

            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("leftLowerArm"),
                poseRig.LeftLowerArm.x,
                poseRig.LeftLowerArm.y,
                poseRig.LeftLowerArm.z
            );
        }

    } else {
        // Fallback idle pose
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        const leftArm  = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");

        if (rightArm) applyRotation(rightArm, 0, 0, -1.2);
        if (leftArm)  applyRotation(leftArm,  0, 0,  1.2);
    }

    // ===============================
    // RIGHT HAND TRACKING
    // ===============================
    if (results.rightHandLandmarks) {

        const rightHandRig = window.Kalidokit.Hand.solve(
            results.rightHandLandmarks,
            "Right"
        );

        if (rightHandRig) {

            const wrist = vrm.humanoid.getNormalizedBoneNode("rightHand");

            if (wrist && rightHandRig.RightWrist) {
                applyRotation(
                    wrist,
                    rightHandRig.RightWrist.x,
                    rightHandRig.RightWrist.y,
                    rightHandRig.RightWrist.z
                );
            }

            const fingerMapRight = {
                rightThumbMetacarpal:    rightHandRig.RightThumbProximal,
                rightThumbProximal:      rightHandRig.RightThumbIntermediate,
                rightThumbDistal:        rightHandRig.RightThumbDistal,
                rightIndexProximal:      rightHandRig.RightIndexProximal,
                rightIndexIntermediate:  rightHandRig.RightIndexIntermediate,
                rightIndexDistal:        rightHandRig.RightIndexDistal,
                rightMiddleProximal:     rightHandRig.RightMiddleProximal,
                rightMiddleIntermediate: rightHandRig.RightMiddleIntermediate,
                rightMiddleDistal:       rightHandRig.RightMiddleDistal,
                rightRingProximal:       rightHandRig.RightRingProximal,
                rightRingIntermediate:   rightHandRig.RightRingIntermediate,
                rightRingDistal:         rightHandRig.RightRingDistal,
                rightLittleProximal:     rightHandRig.RightLittleProximal,
                rightLittleIntermediate: rightHandRig.RightLittleIntermediate,
                rightLittleDistal:       rightHandRig.RightLittleDistal,
            };

            for (const [boneName, rot] of Object.entries(fingerMapRight)) {
                if (!rot) continue;

                applyRotation(
                    vrm.humanoid.getNormalizedBoneNode(boneName),
                    rot.x,
                    rot.y,
                    rot.z
                );
            }
        }
    }

    // ===============================
    // LEFT HAND TRACKING
    // ===============================
    if (results.leftHandLandmarks) {

        const leftHandRig = window.Kalidokit.Hand.solve(
            results.leftHandLandmarks,
            "Left"
        );

        if (leftHandRig) {

            const wrist = vrm.humanoid.getNormalizedBoneNode("leftHand");

            if (wrist && leftHandRig.LeftWrist) {
                applyRotation(
                    wrist,
                    leftHandRig.LeftWrist.x,
                    leftHandRig.LeftWrist.y,
                    leftHandRig.LeftWrist.z
                );
            }

            const fingerMapLeft = {
                leftThumbMetacarpal:    leftHandRig.LeftThumbProximal,
                leftThumbProximal:      leftHandRig.LeftThumbIntermediate,
                leftThumbDistal:        leftHandRig.LeftThumbDistal,
                leftIndexProximal:      leftHandRig.LeftIndexProximal,
                leftIndexIntermediate:  leftHandRig.LeftIndexIntermediate,
                leftIndexDistal:        leftHandRig.LeftIndexDistal,
                leftMiddleProximal:     leftHandRig.LeftMiddleProximal,
                leftMiddleIntermediate: leftHandRig.LeftMiddleIntermediate,
                leftMiddleDistal:       leftHandRig.LeftMiddleDistal,
                leftRingProximal:       leftHandRig.LeftRingProximal,
                leftRingIntermediate:   leftHandRig.LeftRingIntermediate,
                leftRingDistal:         leftHandRig.LeftRingDistal,
                leftLittleProximal:     leftHandRig.LeftLittleProximal,
                leftLittleIntermediate: leftHandRig.LeftLittleIntermediate,
                leftLittleDistal:       leftHandRig.LeftLittleDistal,
            };

            for (const [boneName, rot] of Object.entries(fingerMapLeft)) {
                if (!rot) continue;

                applyRotation(
                    vrm.humanoid.getNormalizedBoneNode(boneName),
                    rot.x,
                    rot.y,
                    rot.z
                );
            }
        }
    }
};

// ===============================
// RENDER LOOP
// ===============================
function animate() {
    requestAnimationFrame(animate);

    if (currentVrm) {
        updateAvatarFade();
        currentVrm.update(clock.getDelta());
    }

    renderer.render(scene, camera);
}

animate();

// ===============================
// MEDIAPIPE SETUP
// ===============================
function startTracking() {

    if (!window.Holistic || !window.Camera) {
        console.error("MediaPipe Holistic atau Camera Utils belum ter-load.");
        return;
    }

    const holistic = new window.Holistic({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
    });

    holistic.setOptions({
        modelComplexity: 2,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        refineFaceLandmarks: true
    });

    holistic.onResults((results) => {

        // Debug UI kiri atas
        setDebugText('dbg-face',  results.faceLandmarks      ? '✅' : '❌');
        setDebugText('dbg-right', results.rightHandLandmarks ? '✅' : '❌');
        setDebugText('dbg-left',  results.leftHandLandmarks  ? '✅' : '❌');
        setDebugText('dbg-pose',  results.poseWorldLandmarks ? '✅' : '❌');

        const detected = isPersonDetected(results);

        if (currentVrm) {
            if (detected) {
                lastDetectedTime = performance.now();
                targetOpacity = 1;
                currentVrm.scene.visible = true;

                animateVRM(currentVrm, results);
            } else {
                const elapsed = performance.now() - lastDetectedTime;

                if (elapsed > HIDE_DELAY) {
                    targetOpacity = 0;
                }
            }
        }
    });

    const cameraUtils = new window.Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });

    cameraUtils.start();
}

// ===============================
// RESIZE
// ===============================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
});

// ===============================
// AI + SPEECH
// ===============================
const btnMic     = document.getElementById('btn-mic');
const statusText = document.getElementById('status-text');
const chatText   = document.getElementById('chat-text');

// =====================================
// OPENAI API KEY
// Isi key di sini kalau mau fitur AI aktif
// =====================================
window.OPENAI_API_KEY = "";

// ===============================
// SPEECH RECOGNITION
// ===============================
const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    if (chatText) chatText.innerText = "Browser tidak mendukung mikrofon.";
} else {

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;

    // ===============================
    // MIC BUTTON CLICK
    // ===============================
    if (btnMic) {
        btnMic.addEventListener('click', () => {
            recognition.start();

            if (statusText) statusText.innerText = "Status: Mendengarkan...";

            btnMic.style.backgroundColor = "#ff9f43";
            btnMic.innerText = "👂";
        });
    }

    // ===============================
    // USER SPEAKS
    // ===============================
    recognition.onresult = async (event) => {

        const pesanAnda = event.results[0][0].transcript;

        if (chatText) chatText.innerText = "Anda: " + pesanAnda;
        if (statusText) statusText.innerText = "Status: Berpikir...";

        if (btnMic) {
            btnMic.style.backgroundColor = "#1dd1a1";
            btnMic.innerText = "🧠";
        }

        const balasanAI = await tanyaAI(pesanAnda);

        if (chatText) chatText.innerText = "ARIA: " + balasanAI;
        if (statusText) statusText.innerText = "Status: Berbicara...";

        if (btnMic) {
            btnMic.innerText = "🗣️";
        }

        ucapkanBalasan(balasanAI);
    };

    // ===============================
    // ERROR
    // ===============================
    recognition.onerror = (event) => {
        if (statusText) statusText.innerText = "Error mikrofon: " + event.error;

        if (btnMic) {
            btnMic.style.backgroundColor = "#ff4757";
            btnMic.innerText = "🎙️";
        }
    };
}

// ===============================
// OPENAI CHAT FUNCTION
// ===============================
async function tanyaAI(pesan) {

    if (
        !window.OPENAI_API_KEY ||
        window.OPENAI_API_KEY.trim() === "" ||
        window.OPENAI_API_KEY.includes("MASUKKAN_API")
    ) {
        return "Masukkan API Key OpenAI terlebih dahulu.";
    }

    try {
        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${window.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "Nama kamu adalah Aria, seorang asisten hologram virtual yang ramah dan cerdas. Jawablah singkat, santai, jelas, maksimal 2 kalimat dan gunakan bahasa Indonesia."
                        },
                        {
                            role: "user",
                            content: pesan
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 100
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OPENAI ERROR:", errorData);
            return "API OpenAI error atau kuota habis.";
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        console.error(error);
        return "Koneksi internet bermasalah.";
    }
}

// ===============================
// TEXT TO SPEECH
// ===============================
function ucapkanBalasan(teks) {

    const teksBersih = teks.replace(/\*/g, '');
    const ucapan = new SpeechSynthesisUtterance(teksBersih);

    ucapan.lang  = 'id-ID';
    ucapan.rate  = 1.0;
    ucapan.pitch = 1.2;

    ucapan.onend = () => {
        if (statusText) statusText.innerText = "Status: Menunggu...";

        if (btnMic) {
            btnMic.style.backgroundColor = "#ff4757";
            btnMic.innerText = "🎙️";
        }
    };

    window.speechSynthesis.speak(ucapan);
}