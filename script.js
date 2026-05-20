import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// ===============================
// GLOBAL VARIABLES
// ===============================
let currentVrm = null;
const clock = new THREE.Clock();

// ===============================
// THREE.JS SETUP
// ===============================
const videoElement = document.getElementById('webcam');

const canvas = document.createElement('canvas');
canvas.id = 'canvas3d';
document.body.appendChild(canvas);

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
        scene.add(vrm.scene);

        vrm.scene.rotation.y = Math.PI;
        vrm.scene.position.y = -1.2;

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
    const targetQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(x, y, z)
    );
    bone.quaternion.slerp(targetQuat, lerpFactor);
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
    // HAND TRACKING — FIX: pakai Quaternion + slerp
    // ===============================
    if (results.rightHandLandmarks) {

        const rightHandRig = window.Kalidokit.Hand.solve(
            results.rightHandLandmarks,
            "Right"
        );

        if (rightHandRig) {

            // Wrist / pergelangan tangan
            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("rightHand"),
                rightHandRig.RightWrist.x,
                rightHandRig.RightWrist.y,
                rightHandRig.RightWrist.z
            );

            // Jari-jari tangan kanan
            const fingerMapRight = {
                rightThumbProximal:      rightHandRig.RightThumbProximal,
                rightThumbIntermediate:  rightHandRig.RightThumbIntermediate,
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
                    rot.x, rot.y, rot.z
                );
            }
        }
    }

    if (results.leftHandLandmarks) {

        const leftHandRig = window.Kalidokit.Hand.solve(
            results.leftHandLandmarks,
            "Left"
        );

        if (leftHandRig) {

            // Wrist / pergelangan tangan
            applyRotation(
                vrm.humanoid.getNormalizedBoneNode("leftHand"),
                leftHandRig.LeftWrist.x,
                leftHandRig.LeftWrist.y,
                leftHandRig.LeftWrist.z
            );

            // Jari-jari tangan kiri
            const fingerMapLeft = {
                leftThumbProximal:      leftHandRig.LeftThumbProximal,
                leftThumbIntermediate:  leftHandRig.LeftThumbIntermediate,
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
                    rot.x, rot.y, rot.z
                );
            }
        }
    }
    // CATATAN: vrm.update() dipindah ke render loop di bawah
};

// ===============================
// RENDER LOOP — FIX: vrm.update di sini
// ===============================
function animate() {
    requestAnimationFrame(animate);

    // Update VRM di render loop agar delta time konsisten
    if (currentVrm) {
        currentVrm.update(clock.getDelta());
    }

    renderer.render(scene, camera);
}

animate();

// ===============================
// MEDIAPIPE SETUP
// ===============================
function startTracking() {

    if (!window.Holistic || !window.Camera) return;

    const holistic = new window.Holistic({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
    });

    holistic.setOptions({
        modelComplexity: 1,          // Dinaikkan dari 0 → 1 agar tangan lebih akurat
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        refineFaceLandmarks: true
    });

    holistic.onResults((results) => {
        animateVRM(currentVrm, results);
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
});

// ===============================
// AI + SPEECH
// ===============================
const btnMic    = document.getElementById('btn-mic');
const statusText = document.getElementById('status-text');
const chatText   = document.getElementById('chat-text');

// =====================================
// OPENAI API KEY
// =====================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;;

// ===============================
// SPEECH RECOGNITION
// ===============================
const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    chatText.innerText = "Browser tidak mendukung mikrofon.";
} else {

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;

    // ===============================
    // MIC BUTTON CLICK
    // ===============================
    btnMic.addEventListener('click', () => {
        recognition.start();
        statusText.innerText = "Status: Mendengarkan...";
        btnMic.style.backgroundColor = "#ff9f43";
        btnMic.innerText = "👂";
    });

    // ===============================
    // USER SPEAKS
    // ===============================
    recognition.onresult = async (event) => {

        const pesanAnda = event.results[0][0].transcript;
        chatText.innerText = "Anda: " + pesanAnda;
        statusText.innerText = "Status: Berpikir...";
        btnMic.style.backgroundColor = "#1dd1a1";
        btnMic.innerText = "🧠";

        const balasanAI = await tanyaAI(pesanAnda);

        chatText.innerText = "ARIA: " + balasanAI;
        statusText.innerText = "Status: Berbicara...";
        btnMic.innerText = "🗣️";

        ucapkanBalasan(balasanAI);
    };

    // ===============================
    // ERROR
    // ===============================
    recognition.onerror = (event) => {
        statusText.innerText = "Error mikrofon: " + event.error;
        btnMic.style.backgroundColor = "#ff4757";
        btnMic.innerText = "🎙️";
    };
}

// ===============================
// OPENAI CHAT FUNCTION
// FIX: kondisi pengecekan API key diperbaiki
// ===============================
async function tanyaAI(pesan) {

    // FIX: hanya cek kosong atau placeholder, bukan nilai key itu sendiri
    if (!OPENAI_API_KEY || OPENAI_API_KEY.trim() === "" || OPENAI_API_KEY.includes("MASUKKAN_API")) {
        return "Masukkan API Key OpenAI terlebih dahulu.";
    }

    try {
        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${OPENAI_API_KEY}`
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
        statusText.innerText = "Status: Menunggu...";
        btnMic.style.backgroundColor = "#ff4757";
        btnMic.innerText = "🎙️";
    };

    window.speechSynthesis.speak(ucapan);
}