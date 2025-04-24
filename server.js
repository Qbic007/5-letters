const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Токен бота
const token = process.env.TELEGRAM_BOT_TOKEN;
// ID чата (ваш Telegram ID)
const chatId = process.env.TELEGRAM_CHAT_ID;

// Создаем экземпляр бота
const bot = new TelegramBot(token, {polling: false});

// Кэш для хранения текущего слова и даты
let currentData = {
    date: '',
    word: ''
};

// Флаг для отслеживания успешного обновления за день
let dailyUpdateSuccess = false;

// Функция для отправки сообщения в Telegram
async function sendTelegramMessage(message) {
    try {
        await bot.sendMessage(chatId, message);
        console.log('Сообщение отправлено в Telegram');
    } catch (error) {
        console.error('Ошибка при отправке сообщения в Telegram:', error);
    }
}

// Функция для сброса флага ежедневно в 00:00
cron.schedule('0 0 * * *', () => {
    dailyUpdateSuccess = false;
    console.log('Сброс флага ежедневного обновления');
});

// Функция для повторных попыток обновления
async function retryUpdate() {
    if (!dailyUpdateSuccess) {
        console.log('Повторная попытка обновления...');
        await fetchWord();
    }
}

// Функция для получения слова с сайта
async function fetchWord() {
    try {
        console.log('Начинаем получение слова...');
        
        // Добавляем таймаут и заголовки
        const response = await axios.get('https://between-us-girls.ru/5-bukv-tinkoff-segodnya-otvet/', {
            timeout: 10000, // 10 секунд таймаут
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        console.log('Получен ответ от сервера');
        console.log('Статус ответа:', response.status);
        
        if (response.status !== 200) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        
        const $ = cheerio.load(response.data);
        console.log('HTML загружен в cheerio');
        
        let foundTable = false;
        
        // Ищем все таблицы на странице
        $('table').each((tableIndex, table) => {
            console.log(`Найдена таблица #${tableIndex + 1}`);
            foundTable = true;
            
            const firstRow = $(table).find('tr').first();
            console.log('Найдена первая строка таблицы');
            
            const cells = firstRow.find('td');
            console.log(`Количество ячеек в строке: ${cells.length}`);
            
            if (cells.length >= 2) {
                const date = $(cells[0]).text().trim();
                const word = $(cells[1]).text().trim();
                console.log(`Найдены данные: дата=${date}, слово=${word}`);
                
                // Проверяем, изменилось ли слово
                if (currentData.word !== word) {
                    currentData = {
                        date: date,
                        word: word
                    };
                    
                    console.log(`Обновлены данные: ${date} - ${word}`);
                    
                    // Отправляем сообщение в Telegram
                    const message = `Слово дня (${date}): ${word}`;
                    sendTelegramMessage(message);
                    
                    // Отмечаем успешное обновление
                    dailyUpdateSuccess = true;
                    console.log('Ежедневное обновление успешно завершено');
                }
                
                return false; // Прерываем поиск по таблицам
            }
        });
        
        if (!foundTable) {
            console.log('Таблицы не найдены на странице');
            console.log('HTML содержимое:', response.data.substring(0, 1000)); // Выводим первые 1000 символов HTML
        }
    } catch (error) {
        console.error('Ошибка при получении слова:', error.message);
        if (error.response) {
            console.error('Статус ответа:', error.response.status);
            console.error('Данные ответа:', error.response.data);
        }
    }
}

// Запускаем обновление ежедневно в 10:15 по московскому времени
cron.schedule('15 10 * * *', () => {
    console.log('Запуск ежедневного обновления в 10:15 МСК');
    fetchWord();
});

// Запускаем повторные попытки каждый час, начиная с 11:00
cron.schedule('0 11-23 * * *', () => {
    if (!dailyUpdateSuccess) {
        retryUpdate();
    }
});

// Статические файлы
app.use(express.static('public'));

// API endpoint для получения текущего слова
app.get('/api/word', (req, res) => {
    res.json(currentData);
});

// Запускаем сервер
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    // Получаем слово при старте и отправляем сообщение
    fetchWord().then(() => {
        console.log('Начальное сообщение отправлено');
    }).catch(error => {
        console.error('Ошибка при отправке начального сообщения:', error);
    });
}); 