package com.xovenmart.android.di

import com.xovenmart.android.core.dispatchers.AppDispatchers
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {

    @Provides
    @Singleton
    fun provideDispatchers(): AppDispatchers = AppDispatchers(
        io = Dispatchers.IO,
        default = Dispatchers.Default,
        main = Dispatchers.Main,
    )
}