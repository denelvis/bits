import { Inject, Type } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { buildRelations } from '@bits/graphql/relation/relation-builder';
import { IBaseServiceWrite } from '@ext-types/types';
import { IUpdateOneInput } from '@bits/graphql/gql-crud/gql-crud.interface';
import {
  getDefaultCreateOneInput,
  getDefaultUpdateOneInput,
} from '@bits/graphql/gql-crud/gql-crud.dto';
import { IGrpcService } from '@bits/grpc/grpc.interface';

export const WriteResolverMixin =
  <T, N extends string>(Model: Type<T>, Service: Type, modelName: N, Create?: Type) =>
  <B extends Type>(Base: B): Type<IBaseServiceWrite<T, N> & InstanceType<B>> => {
    const UpdateOne = getDefaultUpdateOneInput(Model, modelName);
    const CreateOne = Create || getDefaultCreateOneInput(Model, modelName);

    @Resolver(() => Model)
    class GenericResolver extends Base {
      @Inject(Service) private svc!: IGrpcService;

      @Mutation(() => Boolean)
      async [`deleteOne${modelName}`](@Args('id') id: string): Promise<boolean> {
        const res = await this.svc.deleteOne({ id });
        return res.success;
      }

      @Mutation(() => Boolean)
      async [`updateOne${modelName}`](
        @Args('input', { type: () => UpdateOne }) input: IUpdateOneInput<T>,
      ): Promise<boolean> {
        const res = await this.svc.updateOne({ ...input.update, id: input.id });
        return res.success;
      }

      @Mutation(() => Model)
      async [`createOne${modelName}`](
        @Args('input', { type: () => CreateOne }) input: T,
      ): Promise<T> {
        return this.svc.createOne(input);
      }
    }

    buildRelations(Model, GenericResolver);

    return GenericResolver as any;
  };
