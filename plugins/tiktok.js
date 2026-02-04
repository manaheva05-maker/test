import { Module } from '../lib/plugins.js';
import { TikTokDL } from 'yt-streamer';

Module({command:'tiktok',package:'downloader',description:'Download TikTok videos'})(async(message,match)=>{
    const url=match&&match[1]?match[1].trim():null;
    if(!url||!/https?:\/\/(?:www\.|vt\.)?tiktok\.com\/[^\s]+/i.test(url))return message.send('Please provide a valid tk url');
    const res=await TikTokDL(url);
    if(!res||!res.url)return message.send('err');
    await message.send({video:{url:res.url},caption:`${res.title}\nAuthor: ${res.author}`});
});

