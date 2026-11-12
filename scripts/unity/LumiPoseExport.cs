using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class LumiPoseExport
{
    public static void Run()
    {
        string output = Environment.GetEnvironmentVariable("LUMI_RENDER_DIR");
        if (string.IsNullOrEmpty(output)) throw new Exception("LUMI_RENDER_DIR is required");
        Directory.CreateDirectory(output);

        Scene scene = EditorSceneManager.OpenScene("Assets/Scenes/SampleScene.unity");
        GameObject character = GameObject.Find("CharacterBase");
        if (character == null || character.transform.childCount == 0)
            throw new Exception("SampleScene CharacterBase is missing the active Lumi model");

        foreach (GameObject root in scene.GetRootGameObjects())
        {
            if (root != character && root.name != "Directional Light") root.SetActive(false);
        }

        GameObject model = character.transform.GetChild(0).gameObject;
        Animator animator = model.GetComponentInChildren<Animator>();
        if (animator != null)
        {
            animator.enabled = false;
        }
        Renderer[] renderers = model.GetComponentsInChildren<Renderer>();
        if (renderers.Length == 0) throw new Exception("The active Lumi model has no renderers");
        Bounds bounds = renderers[0].bounds;
        foreach (Renderer renderer in renderers) bounds.Encapsulate(renderer.bounds);

        GameObject cameraObject = new GameObject("Lumi export camera");
        Camera camera = cameraObject.AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0f, 0f, 0f, 0f);
        camera.orthographic = true;
        camera.orthographicSize = Mathf.Max(bounds.extents.y * 1.4f, bounds.extents.x * 1.6f);
        camera.nearClipPlane = 0.1f;
        camera.farClipPlane = 100f;
        camera.allowHDR = false;
        camera.allowMSAA = false;
        camera.transform.position = bounds.center + Vector3.back * 10f;
        camera.transform.LookAt(bounds.center);
        RenderTexture target = new RenderTexture(768, 768, 24, RenderTextureFormat.ARGB32);
        camera.targetTexture = target;
        RenderTexture previous = RenderTexture.active;

        try
        {
            camera.Render(); // Warm up shaders before writing the first transparent frame.
            Export(model, animator, camera, target, output, "lumi-idle.png", "Idle", 0.6f);
            Export(model, animator, camera, target, output, "lumi-wave.png", "Wave", 1.3f);
            Export(model, animator, camera, target, output, "lumi-listen.png", "Idle", 2.4f);
            Export(model, animator, camera, target, output, "lumi-speak.png", "Demo-Speak", 1.0f);
            Export(model, animator, camera, target, output, "lumi-move.png", "WavingOneHand", 0.3f);
            ExportSequence(model, animator, camera, target, output, "idle", "Idle", 32, 0.6f);
            ExportSequence(model, animator, camera, target, output, "wave", "Wave", 32, 0f);
            // Demo-Speak hides the body in later keyframes; keep the complete Idle
            // rig and animate only the jaw bone for a stable speaking loop.
            ExportSequence(model, animator, camera, target, output, "speak", "Idle", 28, 0.6f, 3.625f);
            ExportSequence(model, animator, camera, target, output, "move", "WavingOneHand", 16, 0f);
        }
        finally
        {
            RenderTexture.active = previous;
            camera.targetTexture = null;
            UnityEngine.Object.DestroyImmediate(target);
            UnityEngine.Object.DestroyImmediate(cameraObject);
        }
        Debug.Log("LUMI_POSE_EXPORT_SUCCESS " + output);
    }

    private static void ExportSequence(GameObject model, Animator animator, Camera camera, RenderTexture target,
        string output, string name, string clipName, int count, float offset, float duration = 0f)
    {
        AnimationClip clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(
            "Assets/Animations/Clips/" + clipName + ".anim");
        if (clip == null) throw new Exception("Missing Unity animation: " + clipName);
        string directory = Path.Combine(output, "frames", name);
        Directory.CreateDirectory(directory);
        RenderTexture frameTarget = new RenderTexture(512, 512, 24, RenderTextureFormat.ARGB32);
        camera.targetTexture = frameTarget;
        try
        {
            for (int frame = 0; frame < count; frame++)
            {
                float time = (offset + (duration > 0f ? duration : clip.length) * frame / count) % clip.length;
                Export(model, animator, camera, frameTarget, directory,
                    frame.ToString("D2") + ".png", clipName, time, name == "speak" ? frame : -1);
            }
        }
        finally { camera.targetTexture = target; UnityEngine.Object.DestroyImmediate(frameTarget); }
    }

    private static void Export(GameObject model, Animator animator, Camera camera, RenderTexture target,
        string output, string filename, string clipName, float time, int speakingFrame = -1)
    {
        AnimationClip clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(
            "Assets/Animations/Clips/" + clipName + ".anim");
        if (clip == null) throw new Exception("Missing Unity animation: " + clipName);
        clip.SampleAnimation(model, time);
        Transform arm = animator.GetBoneTransform(HumanBodyBones.RightUpperArm);
        Transform head = animator.GetBoneTransform(HumanBodyBones.Head);
        Transform jaw = animator.GetBoneTransform(HumanBodyBones.Jaw);
        Quaternion armRotation = arm.rotation;
        Quaternion headRotation = head.rotation;
        Quaternion jawRotation = jaw != null ? jaw.localRotation : Quaternion.identity;
        Quaternion modelRotation = model.transform.rotation;
        if (filename == "lumi-wave.png") arm.rotation = Quaternion.AngleAxis(-90f, Vector3.forward) * armRotation;
        if (filename == "lumi-listen.png") head.rotation = Quaternion.AngleAxis(12f, Vector3.forward) * headRotation;
        if (filename == "lumi-speak.png" && jaw != null) jaw.localRotation = Quaternion.AngleAxis(12f, Vector3.right) * jawRotation;
        if (speakingFrame >= 0 && jaw != null)
            jaw.localRotation = Quaternion.AngleAxis(12f * Mathf.Abs(Mathf.Sin(speakingFrame * Mathf.PI / 2f)), Vector3.right) * jawRotation;
        if (filename == "lumi-move.png") model.transform.rotation = Quaternion.AngleAxis(-8f, Vector3.forward) * modelRotation;
        var bakedObjects = new List<GameObject>();
        var skinnedRenderers = model.GetComponentsInChildren<SkinnedMeshRenderer>();
        foreach (SkinnedMeshRenderer skinned in skinnedRenderers)
        {
            Mesh baked = new Mesh();
            skinned.BakeMesh(baked);
            GameObject bakedObject = new GameObject("Baked " + skinned.name);
            bakedObject.transform.SetParent(skinned.transform.parent, false);
            bakedObject.transform.localPosition = skinned.transform.localPosition;
            bakedObject.transform.localRotation = skinned.transform.localRotation;
            bakedObject.transform.localScale = skinned.transform.localScale;
            bakedObject.AddComponent<MeshFilter>().sharedMesh = baked;
            bakedObject.AddComponent<MeshRenderer>().sharedMaterials = skinned.sharedMaterials;
            bakedObjects.Add(bakedObject);
            skinned.enabled = false;
        }
        camera.Render();
        foreach (GameObject bakedObject in bakedObjects)
        {
            UnityEngine.Object.DestroyImmediate(bakedObject.GetComponent<MeshFilter>().sharedMesh);
            UnityEngine.Object.DestroyImmediate(bakedObject);
        }
        foreach (SkinnedMeshRenderer skinned in skinnedRenderers) skinned.enabled = true;
        arm.rotation = armRotation;
        head.rotation = headRotation;
        if (jaw != null) jaw.localRotation = jawRotation;
        model.transform.rotation = modelRotation;
        RenderTexture.active = target;
        Texture2D image = new Texture2D(target.width, target.height, TextureFormat.RGBA32, false);
        image.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0);
        image.Apply();
        File.WriteAllBytes(Path.Combine(output, filename), image.EncodeToPNG());
        UnityEngine.Object.DestroyImmediate(image);
        Debug.Log("LUMI_POSE_EXPORT " + filename + " from " + clipName + " at " + time);
    }
}
