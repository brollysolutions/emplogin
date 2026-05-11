from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("api.urls")),
    # Serve media files through the API path to perfectly bypass ANY strict Nginx proxy rules.
    # Nginx only proxies /test_login/api/ to Django, so we disguise media requests as API requests.
    re_path(r'^api/v1/media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
