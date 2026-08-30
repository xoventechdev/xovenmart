package com.xovenmart.android.di

import com.xovenmart.android.data.api.AuthApi
import com.xovenmart.android.data.api.CatalogApi
import com.xovenmart.android.data.api.CheckoutApi
import com.xovenmart.android.data.api.CustomerApi
import com.xovenmart.android.data.api.I18nApi
import com.xovenmart.android.data.api.OrdersApi
import com.xovenmart.android.data.api.ReferralsApi
import com.xovenmart.android.data.network.ApiClientFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(factory: ApiClientFactory): Json = factory.json

    @Provides
    @Singleton
    fun provideRetrofit(factory: ApiClientFactory): Retrofit = factory.retrofit()

    @Provides @Singleton fun provideAuthApi(r: Retrofit): AuthApi           = r.create(AuthApi::class.java)
    @Provides @Singleton fun provideCatalogApi(r: Retrofit): CatalogApi     = r.create(CatalogApi::class.java)
    @Provides @Singleton fun provideCustomerApi(r: Retrofit): CustomerApi   = r.create(CustomerApi::class.java)
    @Provides @Singleton fun provideOrdersApi(r: Retrofit): OrdersApi       = r.create(OrdersApi::class.java)
    @Provides @Singleton fun provideCheckoutApi(r: Retrofit): CheckoutApi   = r.create(CheckoutApi::class.java)
    @Provides @Singleton fun provideReferralsApi(r: Retrofit): ReferralsApi = r.create(ReferralsApi::class.java)
    @Provides @Singleton fun provideI18nApi(r: Retrofit): I18nApi           = r.create(I18nApi::class.java)
}