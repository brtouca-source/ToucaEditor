package com.toucabr.editor

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.ContentValues
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.MediaStore
import android.webkit.*
import android.view.WindowManager
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.RandomAccessFile
import java.util.UUID
import java.util.concurrent.Executors
import android.util.Base64

class MainActivity : Activity() {
    private lateinit var web: WebView
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var root: File
    private var picker: ((Array<Uri>?) -> Unit)? = null
    private var permission: PermissionRequest? = null
    private val exports = mutableMapOf<String, Pair<File, String>>()
    private val origin = "https://appassets.androidplatform.net"
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        root = File(filesDir,"projects").apply { mkdirs() }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccess = false; allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean = r.url.host != "appassets.androidplatform.net"
            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? {
                if(r.url.host == "appassets.androidplatform.net" && r.url.path.orEmpty().startsWith("/media/")) {
                    return try {
                        val parts = r.url.pathSegments
                        val f = asset(parts[1],parts[2])
                        val meta = JSONObject(File(f.parentFile, f.name+".json").readText())
                        val input = f.inputStream(); val size=f.length()
                        val range = r.requestHeaders.entries.firstOrNull{it.key.equals("Range",true)}?.value
                        if(range != null && range.matches(Regex("bytes=\\d+-\\d*"))) {
                            val bits=range.removePrefix("bytes=").split('-'); val start=bits[0].toLong(); val end=(bits[1].toLongOrNull()?:size-1).coerceAtMost(size-1)
                            require(start<=end); input.channel.position(start)
                            val bounded=object:java.io.FilterInputStream(input){ var left=end-start+1; override fun read():Int {if(left<=0)return -1;val b=super.read();if(b>=0)left--;return b}; override fun read(b:ByteArray,o:Int,l:Int):Int{if(left<=0)return -1;val n=super.read(b,o,minOf(l.toLong(),left).toInt());if(n>0)left-=n;return n}}
                            WebResourceResponse(meta.getString("mime"),null,206,"Partial Content",mapOf("Content-Range" to "bytes $start-$end/$size","Content-Length" to "${end-start+1}","Accept-Ranges" to "bytes"),bounded)
                        } else WebResourceResponse(meta.getString("mime"),null,200,"OK",mapOf("Content-Length" to "$size","Accept-Ranges" to "bytes"),input)
                    } catch(e:Exception) { WebResourceResponse("text/plain","UTF-8",404,"Not Found",emptyMap(),"Mídia não encontrada".byteInputStream()) }
                }
                return loader.shouldInterceptRequest(r.url)
            }
        }
        web.webChromeClient=object:WebChromeClient(){
            override fun onShowFileChooser(w:WebView, cb:ValueCallback<Array<Uri>>, p:FileChooserParams):Boolean { choose(p.acceptTypes.filter{it.isNotBlank()}.toTypedArray(),p.mode==FileChooserParams.MODE_OPEN_MULTIPLE){cb.onReceiveValue(it)};return true }
            override fun onPermissionRequest(r:PermissionRequest){runOnUiThread{
                if(r.origin.toString().trimEnd('/')!=origin){r.deny();return@runOnUiThread}
                val wanted=r.resources.mapNotNull{when(it){PermissionRequest.RESOURCE_AUDIO_CAPTURE->Manifest.permission.RECORD_AUDIO;PermissionRequest.RESOURCE_VIDEO_CAPTURE->Manifest.permission.CAMERA;else->null}}
                if(wanted.isEmpty()){r.deny();return@runOnUiThread}
                permission?.deny();permission=r
                val missing=wanted.filter{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}
                if(missing.isEmpty())grantCapture() else requestPermissions(missing.toTypedArray(),32)
            }}
            override fun onPermissionRequestCanceled(r:PermissionRequest){if(permission===r)permission=null}
            override fun onJsAlert(v:WebView,u:String,m:String,r:JsResult):Boolean {android.app.AlertDialog.Builder(this@MainActivity).setMessage(m).setPositiveButton("OK"){_,_->r.confirm()}.setOnCancelListener{r.cancel()}.show();return true}
            override fun onJsConfirm(v:WebView,u:String,m:String,r:JsResult):Boolean {android.app.AlertDialog.Builder(this@MainActivity).setMessage(m).setPositiveButton("Confirmar"){_,_->r.confirm()}.setNegativeButton("Cancelar"){_,_->r.cancel()}.setOnCancelListener{r.cancel()}.show();return true}
            override fun onJsPrompt(v:WebView,u:String,m:String,d:String?,r:JsPromptResult):Boolean {val input=android.widget.EditText(this@MainActivity);input.setText(d);android.app.AlertDialog.Builder(this@MainActivity).setMessage(m).setView(input).setPositiveButton("Salvar"){_,_->r.confirm(input.text.toString())}.setNegativeButton("Cancelar"){_,_->r.cancel()}.setOnCancelListener{r.cancel()}.show();return true}
        }
        web.addJavascriptInterface(Bridge(),"toucaAndroid")
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(web);web.loadUrl("$origin/assets/touca-app/index.html")
    }
    private fun grantCapture(){val r=permission?:return; permission=null; val allowed=r.resources.filter{when(it){PermissionRequest.RESOURCE_AUDIO_CAPTURE->checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;PermissionRequest.RESOURCE_VIDEO_CAPTURE->checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;else->false}};if(allowed.isEmpty())r.deny() else r.grant(allowed.toTypedArray())}
    override fun onRequestPermissionsResult(c:Int,p:Array<out String>,g:IntArray){super.onRequestPermissionsResult(c,p,g);if(c==32)grantCapture()}
    private fun choose(types:Array<String>,multi:Boolean,cb:(Array<Uri>?)->Unit){
        if(picker!=null){cb(null);return};picker=cb
        try{startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply{addCategory(Intent.CATEGORY_OPENABLE);type=if(types.size==1)types[0] else "*/*";if(types.isNotEmpty())putExtra(Intent.EXTRA_MIME_TYPES,types);putExtra(Intent.EXTRA_ALLOW_MULTIPLE,multi)},31)}catch(e:Exception){picker=null;cb(null)}
    }
    override fun onActivityResult(c:Int,r:Int,d:Intent?){super.onActivityResult(c,r,d);if(c==31){val cb=picker;picker=null;val list=if(r==RESULT_OK){d?.clipData?.let{cd->Array(cd.itemCount){cd.getItemAt(it).uri}}?:d?.data?.let{arrayOf(it)}}else null;cb?.invoke(list)}}
    private fun token(s:String):String {require(s.matches(Regex("[a-zA-Z0-9_-]{1,140}"))){"Identificador inválido"};return s}
    private fun dir(id:String)=File(root,token(id)).apply{mkdirs()}
    private fun asset(p:String,id:String)=File(File(dir(p),"assets").apply{mkdirs()},token(id))
    private fun url(p:String,id:String)="$origin/media/${token(p)}/${token(id)}"
    private fun atomic(f:File,s:String){val tmp=File(f.path+".tmp");tmp.writeText(s);check(tmp.renameTo(f)){"Não foi possível salvar"}}
    private fun resolve(id:String,value:Any?=null,error:String?=null){val result=JSONObject().put("value",value?:JSONObject.NULL).put("error",error?:JSONObject.NULL);runOnUiThread{web.evaluateJavascript("window.__toucaReply(${JSONObject.quote(id)},$result)",null)}}
    private fun publish(f:File,name:String,mime:String,video:Boolean):String {
        val values=ContentValues().apply{put(MediaStore.MediaColumns.DISPLAY_NAME,name);put(MediaStore.MediaColumns.MIME_TYPE,mime);put(MediaStore.MediaColumns.RELATIVE_PATH,if(video)"Movies/ToucaEditor" else "Download/ToucaEditor");put(MediaStore.MediaColumns.IS_PENDING,1)}
        val uri=contentResolver.insert(if(video)MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:error("Falha ao criar arquivo")
        try{contentResolver.openOutputStream(uri,"w")!!.use{out->f.inputStream().use{it.copyTo(out)}};values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);contentResolver.update(uri,values,null,null);return uri.toString()}catch(e:Exception){contentResolver.delete(uri,null,null);throw e}
    }
    private fun importUri(p:String,u:Uri):JSONObject{
        var name="Mídia";contentResolver.query(u,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())name=it.getString(0)}
        val mime=contentResolver.getType(u)?:"application/octet-stream";val type=mime.substringBefore('/');require(type in listOf("image","video","audio")){"Formato não suportado: $name"}
        val id=UUID.randomUUID().toString();val f=asset(p,id)
        try{contentResolver.openInputStream(u)!!.use{input->f.outputStream().use{input.copyTo(it)}}}catch(e:Exception){f.delete();throw e}
        val meta=JSONObject().put("mime",mime).put("name",name).put("type",type).put("bytes",f.length());atomic(File(f.path+".json"),meta.toString())
        return meta.put("id",id).put("data",url(p,id)).put("nativeStored",true).put("nativeStoredV18",true)
    }
    inner class Bridge {
        @JavascriptInterface fun request(id:String,method:String,json:String){
            val a=try{JSONArray(json)}catch(e:Exception){resolve(id,error="Parâmetros inválidos");return}
            if(method=="importNativeFiles"||method=="openProjectFile") {runOnUiThread{
                val kind=a.optString(1,"all");val types=if(method=="openProjectFile")arrayOf("*/*")else if(kind=="audio")arrayOf("audio/*")else if(kind=="media")arrayOf("image/*","video/*")else arrayOf("image/*","video/*","audio/*")
                choose(types,method!="openProjectFile"){uris->io.execute{try{val result:Any?=if(method=="openProjectFile")uris?.firstOrNull()?.let{contentResolver.openInputStream(it)!!.bufferedReader().use{it.readText()}}else JSONArray().also{out->uris?.forEach{out.put(importUri(a.getString(0),it))}};resolve(id,result)}catch(e:Exception){resolve(id,error=e.message)}}}
            };return}
            if(method=="confirmClose"){runOnUiThread{finish()};resolve(id,true);return}
            io.execute{try{resolve(id,dispatch(method,a))}catch(e:Exception){resolve(id,error=e.message?:"Falha no Android")}}
        }
    }
    private fun credentialKey():javax.crypto.SecretKey {
        val store=java.security.KeyStore.getInstance("AndroidKeyStore").apply{load(null)}
        (store.getKey("touca-elevenlabs",null) as? javax.crypto.SecretKey)?.let{return it}
        val gen=javax.crypto.KeyGenerator.getInstance("AES","AndroidKeyStore")
        gen.init(android.security.keystore.KeyGenParameterSpec.Builder("touca-elevenlabs",android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT).setBlockModes("GCM").setEncryptionPaddings("NoPadding").build())
        return gen.generateKey()
    }
    private fun dispatch(m:String,a:JSONArray):Any? {
        fun s(i:Int)=a.getString(i)
        return when(m){
            "readCredential"->{val f=File(filesDir,"credential.bin");if(!f.exists()) "" else {val obj=JSONObject(f.readText());val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.DECRYPT_MODE,credentialKey(),javax.crypto.spec.GCMParameterSpec(128,Base64.decode(obj.getString("iv"),Base64.DEFAULT)));String(cipher.doFinal(Base64.decode(obj.getString("data"),Base64.DEFAULT)),Charsets.UTF_8)}}
            "writeCredential"->{val f=File(filesDir,"credential.bin");if(s(0).isEmpty())f.delete() else {require(s(0).length<=1024);val cipher=javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");cipher.init(javax.crypto.Cipher.ENCRYPT_MODE,credentialKey());atomic(f,JSONObject().put("iv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).put("data",Base64.encodeToString(cipher.doFinal(s(0).toByteArray()),Base64.NO_WRAP)).toString())};true}
            "cancelClose"->true
            "getPaths"->JSONObject().put("projects",root.path)
            "listProjects"->JSONArray(root.listFiles().orEmpty().filter{File(it,"project.json").exists()}.mapNotNull{try{JSONObject(File(it,"meta.json").readText()).also{meta->val thumb=File(it,"thumb.txt");if(thumb.exists())meta.put("thumbnail",thumb.readText())}}catch(e:Exception){null}}.sortedByDescending{it.optLong("updatedAt")})
            "saveSnapshot"->{val d=dir(s(0));val obj=JSONObject(s(2));obj.put("projectId",s(0));obj.put("editorVersion","31.6.0-mobile");obj.put("projectSchemaVersion",3);val f=File(d,"project.json");if(!f.exists()&&obj.optJSONArray("clips")?.length()==0&&obj.optJSONArray("assets")?.length()==0)JSONObject().put("skipped",true)else{if(f.exists())f.copyTo(File(d,"project.backup.json"),true);atomic(f,obj.toString());val meta=JSONObject().put("id",s(0)).put("name",s(1)).put("updatedAt",System.currentTimeMillis()).put("clipCount",obj.optJSONArray("clips")?.length()?:0).put("assetCount",obj.optJSONArray("assets")?.length()?:0).put("ratio",obj.optString("ratio","9:16"));atomic(File(d,"meta.json"),meta.toString());meta}}
            "loadSnapshot"->{val obj=JSONObject(File(dir(s(0)),"project.json").readText());val list=obj.optJSONArray("assets")?:JSONArray();for(i in 0 until list.length()){val item=list.getJSONObject(i);if(asset(s(0),item.getString("id")).exists())item.put("data",url(s(0),item.getString("id")))};obj.toString()}
            "deleteSnapshot"->dir(s(0)).deleteRecursively()
            "renameProject"->{val d=dir(s(0));val meta=JSONObject(File(d,"meta.json").readText()).put("name",s(1));val p=JSONObject(File(d,"project.json").readText()).put("name",s(1));atomic(File(d,"project.json"),p.toString());atomic(File(d,"meta.json"),meta.toString());meta}
            "duplicateProject"->{val id=UUID.randomUUID().toString();dir(s(0)).copyRecursively(dir(id),true);val p=JSONObject(File(dir(id),"project.json").readText()).put("projectId",id).put("name",s(1));val list=p.optJSONArray("assets")?:JSONArray();for(i in 0 until list.length()){val item=list.getJSONObject(i);if(asset(id,item.getString("id")).exists())item.put("data",url(id,item.getString("id")))};atomic(File(dir(id),"project.json"),p.toString());val meta=JSONObject(File(dir(id),"meta.json").readText()).put("id",id).put("name",s(1)).put("updatedAt",System.currentTimeMillis());atomic(File(dir(id),"meta.json"),meta.toString());meta}
            "saveProjectThumb"->{atomic(File(dir(s(0)),"thumb.txt"),s(1));true}
            "assetExists"->asset(s(0),s(1)).exists()
            "getAssetUrl"->url(s(0),s(1))
            "storeAsset"->{val data=s(4);require(data.startsWith("data:")&&data.substringBefore(',').endsWith(";base64"));val f=asset(s(0),s(1));f.writeBytes(Base64.decode(data.substringAfter(','),Base64.DEFAULT));atomic(File(f.path+".json"),JSONObject().put("name",s(2)).put("type",s(3)).put("mime",data.substringAfter("data:").substringBefore(';')).toString());JSONObject().put("bytes",f.length()).put("url",url(s(0),s(1)))}
            "storeAssetThumb"->true
            "ensureProxy"->null
            "hardwareInfo","nativeExportCapabilities"->JSONObject().put("available",false).put("engine","Android WebCodecs + MediaStore")
            "saveProjectAs"->{val f=File.createTempFile("project",".touca",cacheDir);try{f.writeText(s(1));publish(f,s(0).replace(Regex("[\\\\/:*?\"<>|]"),"_")+".touca","application/octet-stream",false)}finally{f.delete()}}
            "fileExportStart"->{val name=a.getJSONObject(0).optString("name","Touca").replace(Regex("[\\\\/:*?\"<>|]"),"_")+".mp4";val id=UUID.randomUUID().toString();val f=File.createTempFile("export",".mp4",cacheDir);exports[id]=Pair(f,name);JSONObject().put("jobId",id)}
            "fileExportWrite"->{val job=exports[s(0)]?:error("Exportação encerrada");RandomAccessFile(job.first,"rw").use{it.seek(a.getLong(1));it.write(Base64.decode(s(2),Base64.DEFAULT))};true}
            "fileExportFinish"->{val job=exports[s(0)]?:error("Exportação encerrada");val size=job.first.length();require(size>0);val uri=publish(job.first,job.second,"video/mp4",true);exports.remove(s(0));job.first.delete();JSONObject().put("filePath",uri).put("size",size)}
            "fileExportCancel"->{exports.remove(s(0))?.first?.delete();true}
            "setPresetSound"->{val f=File(filesDir,"preset-${token(s(0))}-${token(s(1))}.json");atomic(f,JSONObject().put("name",s(2)).put("dataUrl",s(3)).toString());true}
            "getPresetSound"->{val f=File(filesDir,"preset-${token(s(0))}-${token(s(1))}.json");if(f.exists())JSONObject(f.readText())else null}
            "clearPresetSound"->File(filesDir,"preset-${token(s(0))}-${token(s(1))}.json").delete()
            else->error("Recurso Android indisponível: $m")
        }
    }
    override fun onBackPressed(){web.evaluateJavascript("window.__toucaBack ? window.__toucaBack() : false"){r->if(r!="true")android.app.AlertDialog.Builder(this).setMessage("Sair do editor?").setPositiveButton("Sair"){_,_->finish()}.setNegativeButton("Continuar",null).show()}}
    override fun onDestroy(){picker?.invoke(null);permission?.deny();web.destroy();io.shutdown();super.onDestroy()}
}
