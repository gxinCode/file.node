# file.node

基于NodeJs的Web文件服务

### server.json
```JSON
{
    "path": "public/files/",    //存储的根路径
    "upcache": "uploads/",      //缓存路径
    "upload": true,     //是否允许上传（普通用户的权限，管理者无论如何都可以上传）
    "mkdir": true,   //是否允许所有人创建目录
    "adnimPwd": "000000",    //管理员密码
    "preview": true,    //是否开启图片缩略图
    "thumbSize": 1024   //显示缩略图的文件大小限制
}
```