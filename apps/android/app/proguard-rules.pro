# Methods the web pages call (the YouTube player bridge, the site's window.JaceMediaApp).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface, *Annotation*, InnerClasses, Signature

# kotlinx.serialization: keep the JSON models' serializers.
-keepclassmembers @kotlinx.serialization.Serializable class com.okjace.jacemedia.** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.okjace.jacemedia.**$$serializer { *; }
-keepclasseswithmembers class com.okjace.jacemedia.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-dontwarn org.slf4j.**
