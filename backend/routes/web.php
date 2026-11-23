<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'app' => 'JuanQuest API',
        'version' => 'v1',
        'status' => 'ok',
    ]);
});
