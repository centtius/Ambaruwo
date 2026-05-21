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

        console.log("VRM Version:", vrm.meta?.metaVersion);
        console.log("Bones:", Object.keys(vrm.humanoid.humanBones));

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
    bone.rotation.x += (x - bone.rotation.x) * lerpFactor;
    bone.rotation.y += (y - bone.rotation.y) * lerpFactor;
    bone.rotation.z += (z - bone.rotation.z) * lerpFactor;
}

// ===============================
// ANIMATE VRM
// ===============================
const animateVRM = (vrm, results) => {
    if (!vrm || !results || !window.Kalidokit) return;

    // Helper khusus VRM 1.0
    function rigBone(boneName, rot, lerpFactor = 0.3) {
        if (!rot) return;
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone) return;
        bone.rotation.x += (rot.x - bone.rotation.x) * lerpFactor;
        bone.rotation.y += (rot.y - bone.rotation.y) * lerpFactor;
        bone.rotation.z += (rot.z - bone.rotation.z) * lerpFactor;
    }

    // ===============================
    // FACE
    // ===============================
    if (results.faceLandmarks) {
        const faceRig = window.Kalidokit.Face.solve(
            results.faceLandmarks,
            { runtime: "mediapipe", video: videoElement }
        );
        if (faceRig) {
            rigBone("neck", {
                x:  faceRig.head.x * 0.5,
                y: -faceRig.head.y * 0.5,  // negate Y untuk VRM 1.0
                z: -faceRig.head.z * 0.5   // negate Z untuk VRM 1.0
            });
            rigBone("head", {
                x:  faceRig.head.x * 0.5,
                y: -faceRig.head.y * 0.5,
                z: -faceRig.head.z * 0.5
            });

            if (vrm.expressionManager) {
                vrm.expressionManager.setValue("aa",         faceRig.mouth.shape.A);
                vrm.expressionManager.setValue("blinkLeft",  1 - faceRig.eye.l);
                vrm.expressionManager.setValue("blinkRight", 1 - faceRig.eye.r);
            }
        }
    }

    // ===============================
    // POSE / LENGAN — Fix VRM 1.0
    // ===============================
    if (results.poseWorldLandmarks) {
        const poseRig = window.Kalidokit.Pose.solve(
            results.poseWorldLandmarks,
            results.poseLandmarks,
            { runtime: "mediapipe", video: videoElement }
        );

        if (poseRig) {
            // Negate Y & Z karena model di-flip Math.PI dan VRM 1.0
            rigBone("rightUpperArm", {
                x:  poseRig.RightUpperArm.x,
                y: -poseRig.RightUpperArm.y,
                z: -poseRig.RightUpperArm.z
            });
            rigBone("rightLowerArm", {
                x:  poseRig.RightLowerArm.x,
                y: -poseRig.RightLowerArm.y,
                z: -poseRig.RightLowerArm.z
            });
            rigBone("leftUpperArm", {
                x:  poseRig.LeftUpperArm.x,
                y: -poseRig.LeftUpperArm.y,
                z: -poseRig.LeftUpperArm.z
            });
            rigBone("leftLowerArm", {
                x:  poseRig.LeftLowerArm.x,
                y: -poseRig.LeftLowerArm.y,
                z: -poseRig.LeftLowerArm.z
            });

            // Spine & chest biar gerakan badan ikut
            rigBone("spine", {
                x:  poseRig.Spine?.x || 0,
                y: -(poseRig.Spine?.y || 0),
                z: -(poseRig.Spine?.z || 0)
            });
        }

    } else {
        // Idle
        const rArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        const lArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        if (rArm) rArm.rotation.z += (-1.2 - rArm.rotation.z) * 0.1;
        if (lArm) lArm.rotation.z += ( 1.2 - lArm.rotation.z) * 0.1;
    }

    // ===============================
    // TANGAN KANAN — Fix bengkok
    // ===============================
    if (results.rightHandLandmarks) {
        const rightHandRig = window.Kalidokit.Hand.solve(
            results.rightHandLandmarks, "Right"
        );
        if (rightHandRig) {
            // Wrist
            rigBone("rightHand", {
                x: -rightHandRig.RightWrist.x,
                y:  rightHandRig.RightWrist.y,
                z:  rightHandRig.RightWrist.z
            });

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
                rigBone(boneName, {
                    x:  rot.x,
                    y: -rot.y,  // negate untuk VRM 1.0
                    z: -rot.z   // negate untuk VRM 1.0
                });
            }
        }
    }

    // ===============================
    // TANGAN KIRI — Fix bengkok
    // ===============================
    if (results.leftHandLandmarks) {
        const leftHandRig = window.Kalidokit.Hand.solve(
            results.leftHandLandmarks, "Left"
        );
        if (leftHandRig) {
            rigBone("leftHand", {
                x: -leftHandRig.LeftWrist.x,
                y:  leftHandRig.LeftWrist.y,
                z:  leftHandRig.LeftWrist.z
            });

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
                rigBone(boneName, {
                    x:  rot.x,
                    y: -rot.y,
                    z: -rot.z
                });
            }
        }
    }
};

// ===============================
// RENDER LOOP — FIX: vrm.update di sini
// ===============================
function animate() {
    requestAnimationFrame(animate);

    // TES SEMENTARA: paksa tangan kanan bergerak naik turun
    if (currentVrm) {
        const t = Date.now() / 1000;
        const rightHand = currentVrm.humanoid.getNormalizedBoneNode("rightHand");
        if (rightHand) {
            rightHand.rotation.z = Math.sin(t) * 0.5; // harusnya goyang
        }
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
        modelComplexity: 2,          // Dinaikkan dari 0 → 1 agar tangan lebih akurat
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        refineFaceLandmarks: true
    });

    holistic.onResults((results) => {
        document.getElementById('dbg-face').textContent  = results.faceLandmarks        ? '✅' : '❌';
        document.getElementById('dbg-right').textContent = results.rightHandLandmarks   ? '✅' : '❌';
        document.getElementById('dbg-left').textContent  = results.leftHandLandmarks    ? '✅' : '❌';
        document.getElementById('dbg-pose').textContent  = results.poseWorldLandmarks   ? '✅' : '❌';

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
const OPENAI_API_KEY = "";

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
    if (!window.OPENAI_API_KEY || window.OPENAI_API_KEY.trim() === "" || window.OPENAI_API_KEY.includes("MASUKKAN_API")) {
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
        statusText.innerText = "Status: Menunggu...";
        btnMic.style.backgroundColor = "#ff4757";
        btnMic.innerText = "🎙️";
    };

    window.speechSynthesis.speak(ucapan);
}